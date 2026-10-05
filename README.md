# 🗿 FARMEO DE AURA | Torneo Ciclotrón
### Torneo de aura LOOKMAXING ZYZZ RIZZ GIGACHAD SIXSEVEN 🤫🧏‍♂️

Aplicación web Single Page Application (SPA) para la gestión y auditoría en tiempo real del Aura de los participantes del torneo, con estética Dark Mode Neón inspirada en la cultura de internet, ranking interactivo y Tribunal de Apelaciones de los viernes.

---

## 👥 Participantes Predefinidos
Todos comienzan con **0 Aura**:
- **Caro**
- **Diego**
- **Nico**
- **Juank**
- **Pedro**
- **Mati**
- **Ceci**
- **Yamil**

---

## 🏗️ Estructura Profesional del Proyecto

El proyecto está separado limpiamente entre configuraciones privadas / administrativas y los archivos públicos que se sirven al navegador:

```
torneo-aura-ciclotron/
├── .env.example                # Plantilla de variables de entorno para Firebase
├── .gitignore                  # Reglas para excluir credenciales, logs y claves privadas
├── config/                     # Configuraciones privadas / servidor
│   └── firebase.config.js      # Plantilla modular para backend / Node
├── firestore.rules             # Reglas de seguridad para Firestore Database
├── firebase.json               # Configuración de despliegue en Firebase Hosting (apunta a public/)
├── server.js                   # Servidor HTTP local para pruebas (apunta a public/)
├── README.md                   # Documentación técnica
└── public/                     # Frontend público (SPA servida a los usuarios)
    ├── index.html              # Vistas HTML (Ranking, Formulario y Tribunal)
    ├── css/
    │   └── style.css           # Estilos Dark Mode Neón, animaciones y diseño móvil
    └── js/
        ├── firebase-config.js  # Módulo con la configuración pública de Firebase
        └── app.js              # Lógica cliente, ordenamiento dinámico y sincronización
```

---

## ✨ Nuevas Funcionalidades y Textos del Torneo

1. **Ordenamiento Interactivo del Ranking**:
   - Botón en la cabecera del ranking para alternar entre **"Mayor a Menor 📈"** y **"Menor a Mayor 📉"**.
   - El Top 1 absoluto (**Sigma Supremo 🗿**) se mantiene destacado en la tarjeta principal.
2. **Jerga y Cultura Brainrot**:
   - Cambiada la denominación de los participantes a **"AURA FARMING"**.
   - Reemplazada la palabra "grind" por términos como *sixseven*, *dab king*, *zyzz rizz* y *mewing god*.
3. **Encabezado Oficial**:
   - Título: **FARMEO DE AURA 🗿**
   - Lema: **Torneo de aura LOOKMAXING ZYZZ RIZZ GIGACHAD SIXSEVEN**
4. **Formularios de Suma y Resta**:
   - **Veredictos**: Etiqueta explicativa *"Explica por qué la decision"*.
   - **Restar**: *"Descuentos de INAURA, evalua bien o Andrea te va a chorear algo"*.
   - **Sumar**: *"Farmeo constante de aura, chupete mal"*.
   - **Regla de oro en ambas**: *"Explicar con motivos y hechos o se abre QR con las tias"*.

---

## ⚖️ El Tribunal de Apelaciones

- **Horario**: Abierto únicamente los **Viernes de 08:00 AM a 16:00 PM**.
- **Modo Dev**: Botón `🛠️ Dev` en la cabecera (o `?dev=true` en la URL) para abrir el tribunal cualquier día para pruebas.
- **Lógica de Castigo**:
  - Al anular un veredicto injusto, el **Target** recupera o anula los puntos.
  - El **Evaluador original** es penalizado descontándole exactamente la misma cantidad de aura de su cuenta por reporte falso.

---

## 🚀 Cómo Ejecutar Localmente y Desplegar

### 1. Pruebas Locales
Inicia el servidor local:
```bash
node server.js
```
Abre en tu navegador:
👉 **`http://localhost:3000/`**

### 2. Conexión con Firebase
Pega tus credenciales en [public/js/firebase-config.js](file:///c:/Users/UniQueen/Documents/torneo-aura-ciclotron/public/js/firebase-config.js).

### 3. Despliegue en Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase deploy
```
