import { Injectable } from '@angular/core';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { environment } from 'src/environments/environment';
import { map } from 'rxjs';
import { HttpService } from 'src/app/core/http/http.service';
import { ConfigService } from '../config/config.service';
import { UserService } from '../users/user.service';
import { WebsocketService } from '../websocket/websocket.service';

export interface Message{
  action: string,
  message: string
}

@Injectable({
  providedIn: 'root'
})
export class ChatAnalyzerService {

  private wsSubject = this.websocketService.connect('wss://kpgqjdhidh.execute-api.eu-west-1.amazonaws.com/prod');
  public messages: Subject<Message> = new Subject<Message>();
  public isConnected$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true); // Estado de conexión

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    private userService: UserService,
    private websocketService: WebsocketService,

  ) {
    this.connectWebSocket();
    }

    private connectWebSocket() {

      this.wsSubject = this.websocketService.connect(
        'wss://kpgqjdhidh.execute-api.eu-west-1.amazonaws.com/prod'
      );

      this.wsSubject.pipe(
        map((event: MessageEvent) => {
          const data = JSON.parse(event.data);

          if (!data || data.message === 'ping') {
            return null;
          }

          return {
            action: data.stop_reason || 'default',
            message: data.completion || '',
            references: data.references || undefined,
          } as Message;
        })
      ).subscribe({
        next: (msg: Message | null) => {
          if (!msg) return;
          this.isConnected$.next(true); // Mantiene la conexión activa
          this.messages.next(msg);
        },
        error: (err) => {
          this.isConnected$.next(false); // Perdió conexión
        },
        complete: () => {
          this.isConnected$.next(false);
        },
      });
    }

    public sendMessage(message: any): void {
      if (!this.isConnected()) {
        this.reconnect();
      }
      this.wsSubject?.next(message);
    }

    isConnected(): boolean {
      return this.wsSubject !== null && !this.wsSubject.closed;
    }

    public reconnect() {
      console.warn('♻️ Intentando reconectar WebSocket...');

      if (this.wsSubject && !this.wsSubject.closed) {
        this.wsSubject.complete();
      }

      this.connectWebSocket();
    }


  //se utiliza para obtener la informacion necesaria de un documento para realizar la conexion con el websocket
  GetDocument(documentID: string, type: string, userEmail: string = ""): Observable<any> {
    const headers = {
      'Content-Type': 'application/json',
      'user_email': userEmail == null ? this.userService.email : userEmail,
      'document_id': documentID,
      'topic': type == 'topic' ? 'true' : 'false'
    };

    return this.httpService
      .get(
        `${this.configService.config.endpoints.get_topic_document_list}/${documentID}`,
        undefined,
        headers
      )
      .pipe(
        map((res: any) => {
          return res;
        })
      );
  }

  //peticion que genera la lista de prompts
  getPromptsList(body: any): Observable<any> {
    const headers = {
      'Content-Type': 'application/json',

    };
    return this.httpService
      .post(
        `${this.configService.config.endpoints.get_prompts}`,
        body,
        headers
      )
      .pipe(
        map((res: any) => {
          return res;
        })
      );
  }

  //peticion que comparte la pregunta y respuesta de un chat
  shareQuestions(body: any): Observable<any> {
    const headers = {
      'Content-Type': 'application/json',
    };

    return this.httpService
      .post(
        `${this.configService.config.endpoints.share_questions_chat}`,
        body,
        headers
      )
      .pipe(
        map((res: any) => {
          return res;
        })
      );
  }

   //peticion para vaciar todo el contenido de un chat
  deleteChat(documentID: string): Observable<any> {
    const headers = {
      'Content-Type': 'application/json',
      "user_email": this.userService.email,
      "document_id": documentID
    };
    return this.httpService
      .delete(
        `${this.configService.config.endpoints.delete_chat}`,
        {},
        headers
      )
      .pipe(
        map((res: any) => {
          return res;
        })
      );
  }

  //peticion que obtiene la lista de documentos de un topico
  getTopicDocumentList(topicID: string): Observable<any> {
    const headers = {
      'Content-Type': 'application/json',
      'topic_id': topicID
    };

    return this.httpService
      .get(
        `${this.configService.config.endpoints.get_topic_document_list}`,
        undefined,
        headers
      )
      .pipe(
        map((res: any) => {
          return res;
        })
      );
  }

  //peticion que obtiene la informacion del documento de un topico para poder conversar con el
  chatTopicDocument(documentID: string, type: string, userEmail: string = ""): Observable<any> {
    const headers = {
      'Content-Type': 'application/json',
      'user_email': userEmail || this.userService.email, // Usa el email del usuario logueado si no se pasa como parámetro
      'document_id': documentID,
      'topic': type === 'topic' ? 'true' : 'false'
    };

    return this.httpService
      .get(
        `${this.configService.config.endpoints.get_topic_document_list}/${documentID}`,
        undefined,
        headers
      )
      .pipe(
        map((res: any) => res)
      );
}

}
