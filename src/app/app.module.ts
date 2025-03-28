import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MessagesComponent } from './shared/components/messages/messages.component';
import { LoadingComponent } from './shared/components/loading/loading.component';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { AuthInterceptor } from './core/http-interceptors/auth/auth.interceptor';
import { BackgroundMode } from '@awesome-cordova-plugins/background-mode/ngx';

@NgModule({
  declarations: [AppComponent, LoadingComponent, MessagesComponent],
  imports: [BrowserModule, IonicModule.forRoot(), AppRoutingModule, BrowserAnimationsModule, HttpClientModule, ProgressSpinnerModule],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    BackgroundMode,
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true,
    }
  ],

  bootstrap: [AppComponent],
})
export class AppModule {}
