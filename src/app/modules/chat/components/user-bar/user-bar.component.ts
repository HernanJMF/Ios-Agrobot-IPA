import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ChatService } from 'src/app/core/services/chat/chat.service';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-user-bar',
  templateUrl: './user-bar.component.html',
  styleUrls: ['./user-bar.component.scss'],
})
export class UserBarComponent  implements OnInit {
  chatMessage: string = "";
  messages: any[] = [];

  @Input() topic: string = "";
  @Input() language: string = "";
  @Input() topic_name: string = "";
  @Input() innerWidth: number = 0;

  @Output() selectStepBack = new EventEmitter<any>();


  constructor(
    private chatService: ChatService,
  ) { }

  ngOnInit() {
    if (Capacitor.getPlatform() === 'ios') {
      Keyboard.addListener('keyboardDidShow', () => {
        document.body.style.height = '100vh';  // 🔥 Evita que iOS reajuste el viewport
        document.body.style.overflow = 'hidden'; // 🔥 Evita el scroll raro
      });

      Keyboard.addListener('keyboardDidHide', () => {
        document.body.style.height = '';
        document.body.style.overflow = '';
      });
    }
  }

  logout(){
    this.chatService.logout();
  }
  stepBack(){ //resetea los valores en caso de volver a la pantalla de selección de topicos
    this.topic= "";
    this.topic_name = "";
    this.chatMessage = "";
    this.messages = [];
    this.selectStepBack.emit({value: true});
  }

}
