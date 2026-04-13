# BoxBoxNow iOS - Setup

## Requisitos
- macOS 13 (Ventura) o superior
- Xcode 15+ (gratis en App Store)
- iPhone con iOS 16+ (para pruebas con BLE)

## Crear proyecto en Xcode

El codigo fuente ya esta generado. Necesitas crear el proyecto Xcode que lo envuelve:

### Opcion A: Crear proyecto nuevo (recomendado)

1. Abre Xcode
2. File > New > Project
3. Selecciona: iOS > App
4. Configura:
   - Product Name: `BoxBoxNow`
   - Team: tu Apple ID
   - Organization Identifier: `com.kartingnow`
   - Interface: SwiftUI
   - Language: Swift
   - **NO** marques "Include Tests"
5. Guarda en: `/Users/jizcue/boxboxnow-v2/ios/` (selecciona la carpeta `ios`)
6. Xcode creara los archivos base. **Borra** los archivos auto-generados:
   - `ContentView.swift`
   - `BoxBoxNowApp.swift` (el nuestro esta en `App/`)
   - `Assets.xcassets` (el nuestro esta en `Resources/`)
7. Arrastra la carpeta `BoxBoxNow/` (la que tiene App/, Models/, etc.) al proyecto en Xcode
   - Selecciona "Create folder references" > NO
   - Selecciona "Create groups" > SI
   - Marca "Copy items if needed" > NO (ya estan en su sitio)
8. En Project Settings:
   - General > Minimum Deployments: iOS 16.0
   - Info > Custom iOS Target Properties: ya configurado en Info.plist
   - Signing & Capabilities > Team: selecciona tu Apple ID

### Probar en simulador
1. Selecciona un simulador arriba (ej: iPhone 15 Pro)
2. Pulsa ▶️ (Cmd+R)
3. Nota: BLE NO funciona en simulador, pero toda la UI si

### Probar en iPhone real
1. Conecta iPhone por USB
2. iPhone: Ajustes > Privacidad y seguridad > Modo Desarrollador > Activar
3. En Xcode, selecciona tu iPhone como destino
4. Pulsa ▶️
5. Primera vez: iPhone pedira "Confiar en este desarrollador"
   Ajustes > General > VPN y gestion de dispositivos > Confiar
