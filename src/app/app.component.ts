import { Component, OnInit } from '@angular/core';
import { UserService } from './core/services/users/user.service';
import { ScreenOrientation } from '@awesome-cordova-plugins/screen-orientation/ngx';
import { Platform } from '@ionic/angular';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss']
})
export class AppComponent implements OnInit {
  isLogged: boolean = false;

  constructor(
    private userService: UserService,
    private platform: Platform,
    private screenOrientation: ScreenOrientation
  ) {
    this.isLogged = this.userService.isAuthenticated;

    this.platform.ready().then(() => {
      requestAnimationFrame(() => {
        try {
          this.screenOrientation.lock(this.screenOrientation.ORIENTATIONS.PORTRAIT);
        } catch (e) {
          console.warn('No se pudo bloquear orientación:', e);
        }

        // 🔄 Escucha cambios de orientación y re-bloquea si es necesario
        this.screenOrientation.onChange().subscribe(() => {
          const current = this.screenOrientation.type;
          console.log('Orientación actual:', current);

          if (current.includes('landscape')) {
            try {
              this.screenOrientation.lock(this.screenOrientation.ORIENTATIONS.PORTRAIT);
            } catch (e) {
              console.warn('No se pudo re-bloquear orientación:', e);
            }
          }
        });
      });
    });
  }

  ngOnInit(): void {
    this.userService.userDataObservable.subscribe(() => {
      this.isLogged = this.userService.isAuthenticated;
    });
  }
}
