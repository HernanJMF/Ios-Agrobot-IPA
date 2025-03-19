import { DatePipe } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnInit, Output, SimpleChanges, ViewChild, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ClipboardService } from 'ngx-clipboard';
import { ChatAnalyzerService } from 'src/app/core/services/chat-analyzer/chat-analyzer.service';
import { ChatService } from 'src/app/core/services/chat/chat.service';
import { LoadingService } from 'src/app/core/services/loading/loading-service.service';
import { MessageService } from 'src/app/core/services/messages/message.service';
import { ToastNotification } from 'src/app/shared/types/ToastNotification';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';
import { App } from '@capacitor/app';
import { ScreenReader } from '@capacitor/screen-reader';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { BackgroundMode } from '@awesome-cordova-plugins/background-mode/ngx';


export interface Reference {
  document: string;
  pages: string[];
}

export interface Message {
  action: string;
  message: string;
  references?: Reference[]; // opcional, ya que en algunas respuestas no se envía
  stop_reason?: string; // 🔹 Agregamos esta propiedad para manejar stop_sequence_2
}


function parseReferencesFromMessage(text: string): {
  cleanText: string;
  references?: Reference[] | Reference[];
} {
  const startTag = "<references>";
  const endTag = "</references>";

  const startIndex = text.indexOf(startTag);
  const endIndex = text.indexOf(endTag);

  // 🔹 Si la referencia no está completamente cerrada, no la mostramos aún
  if (startIndex !== -1 && endIndex === -1) {
    return { cleanText: text.trim() }; // Eliminamos espacios extra y no mostramos referencias
  }

  if (startIndex === -1 || endIndex === -1) {
    return { cleanText: text.trim() }; // No hay referencias en el texto
  }

  const jsonString = text.substring(startIndex + startTag.length, endIndex).trim();

  let references;
  try {
    references = JSON.parse(jsonString);
  } catch (err) {
    console.error("Error parseando referencias:", err);
    references = undefined;
  }

  // 🔹 Eliminamos la parte de <references> del mensaje y limpiamos espacios extra
  const cleanText = (text.substring(0, startIndex) + " " + text.substring(endIndex + endTag.length)).trim();

  return { cleanText, references };
}


@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
  providers: [DatePipe]
})
export class ChatComponent  implements OnInit {

  ticketFormGroup: FormGroup;
  isValid: boolean;
  visible: boolean = false;
  chatMessage: string = "";
  messages: any[] = []; //Lista de mensajes de la conversación
  indexModal: number = -1;
  description: string = "";
  selectedReference: string = "";
  documentPreview : boolean = false;
  chatHistory: Message[] = [];
  isWaiting: boolean = false;    // Estado para deshabilitar el input mientras espera respuesta
  isWaitingForResponse: boolean = false;
  responseTimer: any;
  lastMessage: string = "";
  showReconnectModal: boolean = false;

  private keepAliveInterval: any;
  private lastEventWasKeepAlive: boolean = false;
  private wasConnectedBefore: boolean = false;

  @Input() topic: string = "";
  @Input() language: string = "";
  @Input() topic_name: string = "";
  @Input() innerWidth: number = 0;
  @Input() activeChat: boolean = true; // se utiliza para validar que el chat es valido para conversar, si esta desactivado es por que se esta generando una respuesta/resumen
  @Input() selectedDocument: any;
  @Input() document: any;
  @Input() vector_id: string = "";

  @Output() selectStepBack = new EventEmitter<any>();

  @ViewChild('sp') scrollPanel: ElementRef; //se usa para actualizar el scroll
  @ViewChild('chatInput', {static: false}) inputEl: ElementRef; //se usa para quitar el foco del usuario del campo de mensajes

  constructor(
    private formBuilder: FormBuilder,
    private datePipe: DatePipe,
    private changeDetector : ChangeDetectorRef,
    private chatService: ChatService,
    private clipboardService: ClipboardService,
    private messageService: MessageService,
    private loadingService: LoadingService,
    private chatAnalyzerService: ChatAnalyzerService,
    private backgroundMode: BackgroundMode

  ) {
    this.resetForm();
    this.messages = [];
  }

  ngOnInit(): void {

    this.chatAnalyzerService.isConnected$.subscribe((connected: boolean) => {
      if (!connected) {
        this.showReconnectModal = true; // Muestra el modal cuando se pierde la conexión
      }
    });

    this.backgroundMode.enable();
    // Detectar cuando la app vuelve a primer plano o la pantalla se enciende
    App.addListener("appStateChange", (state) => {
      if (state.isActive) {
        this.reconnectWebSocketIfNeeded();

        if (!this.chatAnalyzerService.isConnected()) {
          this.chatAnalyzerService.reconnect();
        } else {
        }
      }
    });

    // Manejar cuando la pantalla se enciende
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        if (!this.chatAnalyzerService.isConnected()) {
          this.chatAnalyzerService.reconnect();
        }
      }
    });
    // 🔹 Detectar cuando el usuario toca la pantalla después de estar apagada
    ScreenReader.isEnabled().then(() => {
        document.addEventListener("touchstart", () => {
            this.reconnectWebSocketIfNeeded();
        });
    });


    this.chatAnalyzerService.messages.subscribe({
        next: (msg: Message) => {
            const now_utc = this.datePipe.transform(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS', "UTC");

            if (!msg || msg.message === "pong" || msg.message === "ping") {
              this.lastEventWasKeepAlive = true;
              return;
            }

            if (this.lastEventWasKeepAlive) {
              this.lastEventWasKeepAlive = false; // 🔹 Reiniciamos el estado
              this.chatMessage = "";
            }

            //  Si el mensaje está vacío y references es **undefined**, lo ignoramos
            if (msg.message.trim() === "" && (msg.references === undefined || msg.references === null)) {
              return;
            }

            //  Si el mensaje está vacío pero `references` existe (aunque sea `[]`), permitimos procesarlo
            if (msg.message.trim() === "" && Array.isArray(msg.references)) {
            }

            if (
                this.messages.length > 0 &&
                this.messages[this.messages.length - 1].talker === 'AI' &&
                this.messages[this.messages.length - 1].isStreaming
            ) {
                //  Acumula la respuesta en `lastMessage`
                this.lastMessage += msg.message;
                this.messages[this.messages.length - 1].message = this.lastMessage;

                //  Si hay referencias, las agregamos
                if ((msg.action === 'stop_sequence' || msg.action === 'stop_sequence_2') && msg.references) {
                    this.messages[this.messages.length - 1].references = msg.references;

                    this.changeDetector.detectChanges();
                    setTimeout(() => {
                        this.scrollToBottom();
                    }, 100);
                }

                //  Si llega `stop_sequence_2`, finaliza la respuesta
                if (msg.action === 'stop_sequence' || msg.action === 'stop_sequence_2') {
                    this.messages[this.messages.length - 1].isStreaming = false;
                    this.isWaitingForResponse = false;
                    this.lastMessage = ""; //
                    this.chatMessage = "";
                    return;
                }
            } else {
                if ((msg.action === 'stop_sequence' || msg.action === 'stop_sequence_2') && !msg.message.trim() && !msg.references) {
                    this.isWaitingForResponse = false;
                    this.chatMessage = "";
                    return;
                }

                if ((msg.action === 'stop_sequence' || msg.action === 'stop_sequence_2') && msg.references) {
                    if (this.messages.length > 0 && this.messages[this.messages.length - 1].talker === 'AI') {
                        this.messages[this.messages.length - 1].references = msg.references;
                    }
                    this.scrollToBottom();
                    return;
                }

                // Se inicia un nuevo mensaje y `lastMessage` se llena con su contenido
                this.lastMessage = msg.message;
                this.messages.push({
                    action: msg.action,
                    message: this.lastMessage,
                    talker: 'AI',
                    interaction_date: now_utc,
                    animation: false,
                    ticket: false,
                    checked: false,
                    isStreaming: true,
                    references: msg.references ? msg.references : undefined
                });
            }

            this.scrollToBottom();
            this.changeDetector.detectChanges();
        },
        error: (err) => console.error('Error en chat:', err)
    });
    this.startKeepAlive();

  }

  reloadApp() {
    console.warn("🔄 Recargando la aplicación por desconexión...");
    window.location.reload();
  }

  startKeepAlive() {
    setInterval(() => {
      if (this.chatAnalyzerService.isConnected()) {
        this.chatAnalyzerService.sendMessage({
          action: "sendMessage",
          message: "ping"
        });
      } else {
        this.chatAnalyzerService.reconnect();
      }
      }, 8 * 60 * 1000); //  Cada 8 minutos
    }

    reconnectWebSocketIfNeeded() {
      if (!this.chatAnalyzerService.isConnected()) {
        console.warn("🔄 Reconectando WebSocket...");
        this.chatAnalyzerService.reconnect();
      }
    }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['selectedDocument'] && this.selectedDocument) {

        // Generamos la URL directamente en ChatComponent
        this.selectedDocument.preview = `https://prod-agrobot-chat2dox-main-bucket.s3.eu-west-1.amazonaws.com/${this.selectedDocument.S3_directory}`;

        this.startChatWithDocument();
    }
}

  startChatWithDocument() {
    if (this.selectedDocument && this.selectedDocument.status) {
        this.messages = [];
        this.messages.push({ text: `Chateando con el documento: ${this.selectedDocument.alias}`, sender: 'system' });
    }
}

sendMessage() {

  if (!this.chatAnalyzerService.isConnected()) { // ✅ Llamamos desde el servicio
    console.warn("⚠️ WebSocket desconectado, reconectando antes de enviar el mensaje...");
    this.chatAnalyzerService.reconnect(); // ✅ Llamamos desde el servicio
  }

  if (!this.chatMessage.trim()) {
    return;
  }
  this.isWaitingForResponse = true; // Bloquea el input mientras esperamos

  // Toma los últimos 6 mensajes del historial (si es necesario)
  let chat_history: any[] = this.messages.slice(-6);

  // Construye el objeto a enviar (payload)
  let payload: any = {
    action: 'sendMessage',
    message: this.chatMessage,
    language: this.language,
    topic: this.topic_name,
    summary: "false",
    admin: "pozo",
    channel: "apk",
    chat_history: chat_history
  };
  if (this.selectedDocument?.vector_id) {
    payload.vector_id = this.selectedDocument.vector_id;
  }

  const now_utc = this.datePipe.transform(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS', "UTC");

  // Agrega el mensaje del usuario
  this.messages.push({
    action: "sendMessage",
    message: this.chatMessage,
    talker: 'HUMAN',
    interaction_date: now_utc,
    animation: false,
    ticket: false,
    checked: false
  });

  // Agrega un mensaje temporal para la respuesta del bot
  this.messages.push({
    action: "sendMessage",
    message: '...',
    talker: 'AI',
    interaction_date: now_utc,
    animation: true,
    ticket: false,
    checked: false,
    isStreaming: true
  });

  // 🔹 Muestra el mensaje de "Generando respuesta" en el input
  this.chatMessage = this.language === 'english' ? "Generating answer..." : "Generando respuesta...";

  this.changeDetector.detectChanges();
  this.scrollToBottom();

  this.chatAnalyzerService.sendMessage(payload);
}



  showDocumentPreview() {
    if (this.selectedDocument && this.selectedDocument.S3_directory) {
      const decodedPath = decodeURIComponent(this.selectedDocument.S3_directory); // 🔹 Decodificar primero
      this.selectedDocument.preview = `https://prod-agrobot-chat2dox-main-bucket.s3.eu-west-1.amazonaws.com/${encodeURIComponent(decodedPath)}`; // 🔹 Luego codificar correctamente
      this.documentPreview = true;
    } else {
    }
  }

  //formatea la fecha que se muestra en los mensajes del chat
  formatDate(date: any){
    let dateA = date.split("-");
    let timeA = dateA[2].split(' ')[1].split(":");
    return <any>new Date(Date.UTC(dateA[0], dateA[1],dateA[2].split(' ')[0], timeA[0], timeA[1], timeA[2] ))
  }

  //Copia la pregunta y respuesta al portapapeles
  copyQuestionToClipboard(message: string, index: number) {
    // Obtiene el mensaje anterior (pregunta) y el mensaje actual (respuesta)
    const previousMessage = this.messages[index - 1]?.message || '';
    const currentMessage = message || '';

    // Combina la pregunta y la respuesta en un solo mensaje
    const combinedMessage = `${previousMessage}\n\n${currentMessage}`;

    // Copia el mensaje combinado al portapapeles
    this.clipboardService.copy(combinedMessage);
    const notification: ToastNotification = {
      title: this.language == 'english' ? 'The answer has been copied to the clipboard' : 'La respuesta ha sido copiada al portapapeles',
      content: '',
      success_status: true,
    };
    this.messageService.Notify(notification);
  }

  onDocumentClick() {
    // Aquí puedes abrir un modal, mostrar más información, etc.
  }
  scrollToBottom(): void { //esto sirve para que el scroll de la lista de mensajes baje completamente
    setTimeout(() => {
      this.changeDetector.detectChanges();
      if (this.scrollPanel) {
        this.scrollPanel.nativeElement.scrollTop = this.scrollPanel.nativeElement.scrollHeight;
      }
    }, 100);
  }

  //se usa para reiniciarlizar las interacciones del input y no ocurran errores de interaccion
  onKeydown(event: any){
    event.preventDefault();
  }

  cleanUnnecessaryWhiteSpaces(){// cada vez que se escribe un espacio en blanco en el correo se elimina
    this.ticketFormGroup.controls['email'].setValue(this.ticketFormGroup.controls['email'].value.replace(/\s/g,''))
  }

  stepBack(){ //resetea los valores en caso de volver a la pantalla de selección de topicos
    this.topic= "";
    this.topic_name = "";
    this.chatMessage = "";
    this.messages = [];
    this.selectStepBack.emit({value: true});
  }

  clearData(){
    this.topic= "";
    this.topic_name = "";
    this.chatMessage = "";
    this.messages = [];
  }

  //inicializa el formulario de crear ticket
  resetForm(){
    this.ticketFormGroup = this.formBuilder.group({
      email: ["", [Validators.required,
                   Validators.email]],
      name: ["", [Validators.required]],
      description: [this.description, [Validators.required]]
    });

    this.ticketFormGroup.statusChanges.subscribe(status => {
      this.isValid = status == "VALID" ? true : false;
    });
  }

  openModal(index: number){ // abre el modal de creación de tickets
    this.resetForm();
    this.indexModal = index;
    this.visible = true;
  }

  createTicket(){// realiza la peticion para obtener el ticket
    let body: any = {};
    body = {
      name: this.ticketFormGroup.controls['name'].value,
      email: this.ticketFormGroup.controls['email'].value,
      description: this.ticketFormGroup.controls['description'].value
    }
    this.loadingService.show();

    //se envia la informacion del ticket al back
    this.chatService.generateTicket(body).subscribe({
      next: (res: any) => {
        this.messages[this.indexModal].ticketID = res.response;
        this.messages[this.indexModal].checked = true;
        this.scrollToBottom();
        this.visible = false;
        this.loadingService.hide();
        const notification: ToastNotification = {
          title: this.language == 'english' ? 'The ticket has been created successfully' : 'El ticket se ha creado con éxito',
          content: '',
          success_status: true,
        };
        this.messageService.Notify(notification);
      },
      error: () =>{
        this.loadingService.hide();
        const notification: ToastNotification = {
          title: this.language == 'english' ? 'Ticket has not been created' : 'No se ha creado el ticket',
          content: this.language == 'english' ? 'The ticket could not be generated, please try again later.' : 'No se ha podido generar el ticket, inténtelo de nuevo más tarde.',
          success_status: false,
        };
        this.messageService.Notify(notification);
      }
    });
  }

  logout(){
    this.chatService.logout();
  }

  formatMessage(message: string): string {
    if (!message) return "";

    let cleanedMessage = message.replace(/\n{2,}/g, "\n").trim();
    let html = marked.parse(cleanedMessage) as string; // ✅ Forzar como string si es seguro
    return DOMPurify.sanitize(html);
  }

  placeholderText(){
    if(this.topic_name.length == 0){
      return this.language == 'english' ? 'Select a topic' : 'Seleccione un tópico';
    }else{
      return "";
    }
  }

  reloadDocument() {
    this.selectedDocument = { ...this.selectedDocument }; // Fuerza el cambio para que se recargue
  }

  showDocument() {
    this.documentPreview = true;
}

}
