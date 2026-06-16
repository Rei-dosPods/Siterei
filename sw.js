// sw.js - Motor de escuta em segundo plano com credenciais oficiais
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyDd7s3h6-TPleYJ590yKKCKalENyVwtCMg",
    authDomain: "rei-dos-pods.firebaseapp.com",
    projectId: "rei-dos-pods",
    storageBucket: "rei-dos-pods.firebasestorage.app",
    messagingSenderId: "763358246928",
    appId: "1:763358246928:web:ff3101060d43b737087295"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Captura a notificação enviada quando o site está 100% FECHADO
messaging.onBackgroundMessage((payload) => {
    console.log('Push em segundo plano recebido:', payload);

    const notificationTitle = payload.notification ? payload.notification.title : "Rei dos Pods 👑";
    const notificationOptions = {
        body: payload.notification ? payload.notification.body : "Tens uma nova atualização no teu pedido!",
        icon: 'https://wcjzrdovqnyytveospck.supabase.co/storage/v1/object/public/pods/logo.png', 
        badge: 'https://wcjzrdovqnyytveospck.supabase.co/storage/v1/object/public/pods/logo.png',
        vibrate: [200, 100, 200],
        data: {
            url: payload.data ? payload.data.url : '/'
        }
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// Abre o site na aba certa quando o cliente clica na notificação do telemóvel
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            if (clientList.length > 0) {
                let client = clientList[0];
                if ('focus' in client) return client.focus();
            }
            if (clients.openWindow) {
                return clients.openWindow(event.notification.data.url || '/');
            }
        })
    );
});