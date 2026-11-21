# Agenda Salón

Aplicación de agenda para salones de belleza, creada con Ionic React y empaquetada como app nativa mediante Capacitor. En Android/iOS usa SQLite de Capacitor; en navegador usa SQLite con `sql.js` y conserva la base en el almacenamiento local del sitio.

## Requisitos

- Node.js 20 o posterior.
- Para Android: Android Studio y Android SDK.
- Para iOS: macOS y Xcode.

## Desarrollo web

```sh
npm install
npm run start
```

## Android

```sh
npm install
npx cap add android
npm run android
```

## iOS

```sh
npm install
npx cap add ios
npm run ios
```

`npm run cap:sync` construye la aplicación web y sincroniza los cambios con las plataformas nativas. Tras añadir una plataforma por primera vez, los proyectos `android/` e `ios/` se mantienen como proyectos nativos de Capacitor.

## Funciones

- Inicio de sesión de demostración con nombre de usuario.
- Resumen diario y agenda filtrable por estilista.
- Alta y consulta de clientes y servicios.
- Creación y detalle de citas, confirmación y cancelación.
- Resumen de ingresos y actividad.

La primera ejecución crea las tablas vacías y no carga datos de ejemplo. El acceso es local de demostración y no valida credenciales contra un servidor.

