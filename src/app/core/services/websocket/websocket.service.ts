// websocket.service.ts
import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { share, retry } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private subject: Subject<MessageEvent> | null = null;

  // Conecta a la URL del WebSocket y retorna un Subject para interactuar
  public connect(url: string, reconnect: boolean = false): Subject<MessageEvent> {
    if (reconnect || !this.subject) {
      this.subject = this.create(url);
    }
    return this.subject;
  }

  // Crea la conexión WebSocket y define la lógica de envío/recepción
  private create(url: string): Subject<MessageEvent> {
    const ws = new WebSocket(url);

    // Agregamos un log para confirmar que se abre la conexión
    ws.onopen = () => {
    };

    // Creamos un observable que emite los eventos del WebSocket
    const observable = new Observable<MessageEvent>((observer) => {
      ws.onmessage = (event: MessageEvent) => observer.next(event);
      ws.onerror = (error: any) => observer.error(error);
      ws.onclose = () => observer.complete();
      // Al cancelar la suscripción, cerramos el WebSocket
      return () => ws.close();
    }).pipe(
      share(),  // Permite compartir la misma conexión entre varios suscriptores
      retry()   // Reintenta la conexión en caso de error
    );

    // Observer para enviar mensajes: solo se envía si la conexión está abierta
    const observer = {
      next: (data: any) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(data));
        } else {
          console.error('WebSocket no está abierto. Estado:', ws.readyState);
        }
      }
    };

    // Combina el observer y el observable en un Subject
    return Subject.create(observer, observable);
  }
}
