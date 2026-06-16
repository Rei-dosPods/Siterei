// ====================================================
// 🚀 CONFIGURAÇÕES DO SEU SUPABASE
// ====================================================
const SUPABASE_URL = "https://wcjzrdovqnyytveospck.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjanpyZG92cW55eXR2ZW9zcGNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExOTExNDcsImV4cCI6MjA5Njc2NzE0N30.cSXeFxYnD24yNP-zIlhIONLsHx-oVDRg8OI9aSEL7oY";

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
window.supabaseClient = supabaseClient;

let currentUser = null; 
let currentCompanyData = null; 
let authMode = "login";
let selectedFlavor = null;
let openedProductData = null;
let globalProductsCache = []; 
let currentCategoryFilter = "all";
let activeChatOrderId = null;
let isStoreOpenGlobal = true;

let holdTimer = null;
let holdProgress = 0;
let realtimeChannel = null;

// ====================================================
// 🎵 MOTOR DE ÁUDIO NATIVO E NOTIFICAÇÃO DO SISTEMA
// ====================================================
function tocarAlertaSonoroPedido() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscilador1 = audioCtx.createOscillator();
        const ganho1 = audioCtx.createGain();
        oscilador1.type = 'sine';
        oscilador1.frequency.setValueAtTime(880, audioCtx.currentTime); 
        ganho1.gain.setValueAtTime(0.3, audioCtx.currentTime);
        oscilador1.connect(ganho1);
        ganho1.connect(audioCtx.destination);
        oscilador1.start();
        oscilador1.stop(audioCtx.currentTime + 1.2);
    } catch (e) {
        console.error("Erro ao reproduzir som de alerta:", e);
    }
}

function dispararNotificacaoNativa(titulo, corpo) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    navigator.serviceWorker.getRegistration().then(function(reg) {
        const options = {
            body: corpo,
            icon: 'https://cdn-icons-png.flaticon.com/512/1161/1161388.png', 
            vibrate: [200, 100, 200, 100, 200],
            requireInteraction: true 
        };
        if (reg && reg.showNotification) {
            reg.showNotification(titulo, options);
        } else {
            new Notification(titulo, options);
        }
    });
}

// ====================================================
// 🍪 COOKIES ENGINE
// ====================================================
function setCookie(name, value, days = 7) {
    const d = new Date(); d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = name + "=" + encodeURIComponent(value) + ";expires=" + d.toUTCString() + ";path=/;SameSite=Strict";
}
function getCookie(name) {
    const cname = name + "="; const ca = decodeURIComponent(document.cookie).split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i].trim();
        if (c.indexOf(cname) == 0) return c.substring(cname.length, c.length);
    }
    return "";
}
function deleteCookie(name) { document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"; }

// ====================================================
// 🚨 SISTEMA DE BLOQUEIO E PERMISSÃO FORÇADA
// ====================================================
async function verificarEForcarPermissaoNotificacao() {
    if (!currentUser || currentUser.role === 'superadmin') return;

    if ('serviceWorker' in navigator && 'Notification' in window) {
        navigator.serviceWorker.register('/sw.js').catch(err => console.error("Erro SW:", err));

        if (Notification.permission === 'default') {
            mostrarModalDePermissaoForcada();
        } 
        else if (Notification.permission === 'granted') {
            inicializarNotificacoesPush(currentUser.phone);
        }
        else if (Notification.permission === 'denied') {
            const msg = currentUser.role === 'vendor' 
                ? "Notificações bloqueadas. Você não ouvirá a sirene de novos pedidos se fechar o navegador!" 
                : "Alerta: As notificações estão bloqueadas no seu aparelho. Sem elas, você não saberá quando o motoboy sair.";
            showPremiumNotification("Atenção", msg, "error");
        }
    }
}

function mostrarModalDePermissaoForcada() {
    let modal = document.getElementById('force-notify-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'force-notify-modal';
        modal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.92); z-index:99999; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:20px; text-align:center; backdrop-filter: blur(5px);";
        
        const isVendor = currentUser && currentUser.role === 'vendor';
        const titulo = isVendor ? "Sirene de Pedidos 🚨" : "Atenção Logística 🛵";
        const texto = isVendor 
            ? "Para você <strong>não perder nenhuma venda</strong>, precisamos ativar a sirene e os avisos em tempo real sempre que um cliente fizer um pedido na sua loja." 
            : "Para o seu pedido chegar rápido e com segurança, <strong>precisamos te avisar em tempo real</strong> quando o motoboy sair.";
        const btnTexto = isVendor ? "Ligar Sirene da Loja" : "Liberar Radar";

        modal.innerHTML = `
            <div style="background:var(--card-bg, #111); padding:30px; border-radius:12px; border:2px solid var(--primary, #00DFD8); max-width:400px; box-shadow: 0 0 30px rgba(0, 223, 216, 0.2);">
                <div style="font-size: 40px; margin-bottom:10px;">🔔</div>
                <h2 style="color:var(--primary, #00DFD8); margin-bottom:15px;">${titulo}</h2>
                <p style="color:#ddd; margin-bottom:25px; font-size:15px; line-height:1.6;">${texto}<br><br>Permita as notificações a seguir para continuar.</p>
                <button id="btn-accept-notify" style="background:var(--primary, #00DFD8); color:#000; font-weight:900; font-size:16px; padding:16px 20px; border:none; border-radius:8px; cursor:pointer; width:100%; text-transform:uppercase; box-shadow: 0 4px 15px rgba(0, 223, 216, 0.3);">${btnTexto}</button>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('btn-accept-notify').addEventListener('click', async () => {
            try {
                const permission = await Notification.requestPermission();
                document.getElementById('force-notify-modal').style.display = 'none';
                
                if (permission === 'granted') {
                    showPremiumNotification("Conexão Ativada", "Alertas sincronizados com sucesso!", "success");
                    inicializarNotificacoesPush(currentUser.phone);
                    if (isVendor) tocarAlertaSonoroPedido();
                } else {
                    showPremiumNotification("Bloqueado", "Você recusou os avisos.", "error");
                }
            } catch (err) {
                console.error("Erro na permissão:", err);
                document.getElementById('force-notify-modal').style.display = 'none';
            }
        });
    }
    modal.style.display = 'flex';
}

window.onload = function() {
    const savedUserCookie = getCookie('logged_user');
    if(savedUserCookie) {
        currentUser = JSON.parse(savedUserCookie);
        logUserIn(currentUser);
    }
    setupHoldToBuyButton();
}

function sanitizeInput(text) { return typeof text !== 'string' ? text : text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;"); }

// ====================================================
// 💅 SISTEMA DE NOTIFICAÇÕES VISUAIS PREMIUM (TOAST)
// ====================================================
function showPremiumNotification(title, message, type = "success") {
    let container = document.getElementById('toast-container-premium');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container-premium';
        container.style.cssText = "position: fixed; top: 20px; right: 20px; z-index: 9999999; display: flex; flex-direction: column; gap: 12px; pointer-events: none;";
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const isSuccess = type === 'success';
    const icon = isSuccess ? '✅' : '🚨';
    const color = isSuccess ? '#00DFD8' : '#FF3B30';
    const shadow = isSuccess ? 'rgba(0, 223, 216, 0.25)' : 'rgba(255, 59, 48, 0.25)';

    toast.style.cssText = `
        background: rgba(17, 17, 17, 0.90);
        backdrop-filter: blur(12px);
        border-left: 4px solid ${color};
        color: #fff;
        padding: 16px 20px;
        border-radius: 8px;
        box-shadow: 0 10px 30px ${shadow};
        display: flex;
        align-items: center;
        gap: 15px;
        min-width: 280px;
        max-width: 350px;
        transform: translateX(120%);
        transition: transform 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55), opacity 0.3s ease;
        cursor: pointer;
        pointer-events: auto;
    `;

    toast.innerHTML = `
        <div style="font-size: 26px;">${icon}</div>
        <div style="display: flex; flex-direction: column; flex: 1;">
            <span style="font-weight: 900; font-size: 14px; color: ${color}; text-transform: uppercase; letter-spacing: 0.5px;">${title}</span>
            <span style="font-size: 13px; color: #E0E0E0; margin-top: 4px; line-height: 1.4;">${message}</span>
        </div>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
        });
    });

    toast.onclick = () => {
        toast.style.transform = 'translateX(120%)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    };

    setTimeout(() => {
        if (document.body.contains(toast)) {
            toast.style.transform = 'translateX(120%)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }
    }, 5500);
}

// ====================================================
// 🔐 AUTENTICAÇÃO E LOGIN
// ====================================================
function setAuthMode(mode) {
    authMode = mode;
    const btnLogin = document.getElementById('btn-mode-login');
    const btnRegister = document.getElementById('btn-mode-register');
    if(mode === 'login') {
        btnLogin.classList.add('active'); btnRegister.classList.remove('active');
        document.getElementById('group-auth-name').style.display = 'none';
        const vipField = document.getElementById('group-vip-field');
        if(vipField) { vipField.style.display = 'none'; document.getElementById('auth-vip-code').removeAttribute('required'); }
        document.getElementById('auth-submit-btn').innerText = "Acessar Hub";
    } else {
        btnRegister.classList.add('active'); btnLogin.classList.remove('active');
        document.getElementById('group-auth-name').style.display = 'block';
        let vipField = document.getElementById('group-vip-field');
        if(!vipField) {
            const div = document.createElement('div'); div.className = 'form-group'; div.id = 'group-vip-field';
            div.innerHTML = `<label>Código de Indicação da Loja</label><input type="text" id="auth-vip-code" placeholder="Insira o código fornecido pelo lojista" required>`;
            document.getElementById('auth-form').insertBefore(div, document.getElementById('auth-submit-btn'));
        } else { 
            vipField.style.display = 'block'; document.getElementById('auth-vip-code').setAttribute('required', 'required');
        }
        document.getElementById('auth-submit-btn').innerText = "Criar Minha Conta";
    }
}

async function handleAuth(e) {
    e.preventDefault();
    const phoneInput = sanitizeInput(document.getElementById('auth-phone').value.trim());
    const passwordInput = document.getElementById('auth-password').value;

    if (phoneInput === '404' && passwordInput === '24032008') {
        currentUser = { name: "CEO Master", phone: "404", role: "superadmin", company_id: null, delivery_fee: 0 };
        setCookie('logged_user', JSON.stringify(currentUser), 7);
        logUserIn(currentUser); return;
    }

    if (authMode === 'login') {
        const { data: vendorStore } = await supabaseClient.from('pods_companies').select('*').eq('phone_adm', phoneInput).eq('password_adm', passwordInput).maybeSingle();
        if(vendorStore) {
            if(vendorStore.status === 'blocked') { showPremiumNotification("Bloqueado", "Mensalidade vencida.", "error"); return; }
            currentUser = { name: vendorStore.name, phone: phoneInput, role: "vendor", company_id: vendorStore.id, delivery_fee: vendorStore.delivery_fee };
            setCookie('logged_user', JSON.stringify(currentUser), 7); logUserIn(currentUser); return;
        }

        const { data: userFound } = await supabaseClient.from('pods_users').select('*, pods_companies(status, name, delivery_fee)').eq('phone', phoneInput).eq('password', passwordInput).maybeSingle();
        if (userFound) {
            if(userFound.pods_companies && userFound.pods_companies.status === 'blocked') { showPremiumNotification("Erro", "Loja em manutenção.", "error"); return; }
            currentUser = { name: userFound.name, phone: userFound.phone, role: "client", company_id: userFound.company_id, delivery_fee: userFound.pods_companies.delivery_fee };
            currentCompanyData = userFound.pods_companies;
            setCookie('logged_user', JSON.stringify(currentUser), 7); logUserIn(currentUser);
        } else { showPremiumNotification("Falha", "Credenciais incorretas.", "error"); }
    } else {
        const inviteCode = document.getElementById('auth-vip-code').value.trim();
        const { data: targetCompany } = await supabaseClient.from('pods_companies').select('*').eq('invite_code', inviteCode).maybeSingle();
        if (!targetCompany || targetCompany.status === 'blocked') { showPremiumNotification("Inválido", "Loja não encontrada.", "error"); return; }
        const nameInput = sanitizeInput(document.getElementById('auth-name').value.trim());
        const { error } = await supabaseClient.from('pods_users').insert([{ phone: phoneInput, name: nameInput, password: passwordInput, company_id: targetCompany.id }]);
        if (!error) {
            currentUser = { name: nameInput, phone: phoneInput, role: "client", company_id: targetCompany.id, delivery_fee: targetCompany.delivery_fee };
            setCookie('logged_user', JSON.stringify(currentUser), 7); logUserIn(currentUser);
        } else { showPremiumNotification("Erro", "WhatsApp já cadastrado.", "error"); }
    }
}

async function logUserIn(user) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    document.getElementById('user-display-name').innerText = user.name;
    const titleDisp = document.getElementById('store-title-display'); const subtDisp = document.getElementById('store-vendor-subtitle');

    if(user.role === 'superadmin') {
        titleDisp.innerText = "HUB MESTRE"; subtDisp.innerText = "Gestão Geral"; switchView('super-companies');
    } else if (user.role === 'vendor') {
        titleDisp.innerText = user.name.toUpperCase(); subtDisp.innerText = "Painel Lojista"; switchView('admin');
        verificarEForcarPermissaoNotificacao(); 
    } else {
        titleDisp.innerText = "PODS STORE"; subtDisp.innerText = "Catálogo Privado"; switchView('loja');
        verificarEForcarPermissaoNotificacao();
    }
    fetchStoreStatusInitial(); setupRealtimeListeners(); 
}

function handleLogout() {
    if (realtimeChannel) { supabaseClient.removeChannel(realtimeChannel); }
    deleteCookie('logged_user'); currentUser = null;
    document.getElementById('main-content').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('auth-form').reset(); setAuthMode('login');
}

// ====================================================
// 🔔 FIREBASE INIT
// ====================================================
async function inicializarNotificacoesPush(userPhone) {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.getRegistration();
            if (!registration) return;
            if (Notification.permission === 'granted') {
                if (!window.firebase) await carregarBibliotecasFirebase();
                const config = { apiKey: "AIzaSyDd7s3h6-TPleYJ590yKKCKalENyVwtCMg", authDomain: "rei-dos-pods.firebaseapp.com", projectId: "rei-dos-pods", storageBucket: "rei-dos-pods.firebasestorage.app", messagingSenderId: "763358246928", appId: "1:763358246928:web:ff3101060d43b737087295" };
                if (!firebase.apps.length) firebase.initializeApp(config);
                const messaging = firebase.messaging();
                const token = await messaging.getToken({ serviceWorkerRegistration: registration, vapidKey: 'BJN313FYRPWo4rdGUyoJThln_8Yku22BNr50pisWcUyyGrWty43ySpvaBzESO4Cbpq-0nJidFZTTe-7p2HQ4jyk' });
                if (token) { await supabaseClient.from('pods_users').update({ push_token: token }).eq('phone', userPhone); console.log("Push Ativo!"); }
            }
        } catch (e) { console.error('Erro push:', e); }
    }
}
function carregarBibliotecasFirebase() {
    return new Promise((resolve) => {
        const scriptApp = document.createElement('script'); scriptApp.src = "https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"; document.head.appendChild(scriptApp);
        scriptApp.onload = () => { const scriptMsg = document.createElement('script'); scriptMsg.src = "https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js"; document.head.appendChild(scriptMsg); scriptMsg.onload = () => resolve(); };
    });
}

// ====================================================
// 🏪 CONTROLE DE EXPEDIENTE INTELIGENTE
// ====================================================
function syncStoreStatusInterface(isOpen) {
    isStoreOpenGlobal = isOpen; 
    
    const badge = document.getElementById('store-status-badge');
    if(badge) { 
        badge.innerText = isOpen ? "Aberto" : "Fechado"; 
        badge.className = "status-badge-premium " + (isOpen ? "aberto" : "fechado"); 
    }

    const botoesExpediente = document.querySelectorAll('button[onclick*="toggleStoreStatus"]');
    botoesExpediente.forEach(btn => {
        btn.innerText = isOpen ? "⏸️ Pausar Expediente (Fechar Loja)" : "▶️ Iniciar Expediente (Abrir Loja)";
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
    });
}

async function fetchStoreStatusInitial() { const { data } = await supabaseClient.from('store_status').select('is_open').eq('id', 1).single(); if(data) syncStoreStatusInterface(data.is_open); }

async function toggleStoreStatus(btnElement) { 
    if (btnElement) {
        btnElement.innerText = "Sincronizando com Servidor...";
        btnElement.style.opacity = "0.7";
        btnElement.style.pointerEvents = "none";
    }

    const novoEstado = !isStoreOpenGlobal; 
    const { error } = await supabaseClient.from('store_status').update({ is_open: novoEstado }).eq('id', 1); 
    
    if (error) {
        showPremiumNotification("Erro", "Falha ao comunicar com o servidor.", "error");
        syncStoreStatusInterface(isStoreOpenGlobal); 
    }
}

// ====================================================
// 🎛️ ESCUTA EM TEMPO REAL
// ====================================================
function setupRealtimeListeners() {
    if (!supabaseClient) return;
    if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);

    realtimeChannel = supabaseClient.channel('custom-all-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pods_orders' }, (payload) => {
        const active = document.querySelector('.view-section.active');
        
        if (payload.eventType === 'INSERT') {
            if (currentUser && payload.new.company_id === currentUser.company_id) {
                tocarAlertaSonoroPedido();
                showPremiumNotification("NOVO PEDIDO!", `Ordem #${payload.new.id} recebida!`, "success");
                dispararNotificacaoNativa("Sirene de Pedido!", `Você recebeu um novo pedido: Ordem #${payload.new.id}`);
            }
        }
        
        if (payload.eventType === 'UPDATE') {
            if (currentUser && currentUser.role === 'client' && payload.new.client_phone === currentUser.phone) {
                tocarAlertaSonoroPedido();
                showPremiumNotification("Atualização 🛵", `Pedido mudou para: ${payload.new.status.toUpperCase()}`, "success");
                dispararNotificacaoNativa("Pedido Atualizado", `O status do seu pedido mudou para: ${payload.new.status.toUpperCase()}`);
            }
        }

        if (!active) return;
        if (active.id === 'view-admin') renderAdminOrders();
        else if (active.id === 'view-historico') renderClientHistory();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pods_messages' }, (payload) => {
        if (document.getElementById('chat-modal').style.display === 'flex' && activeChatOrderId == payload.new.order_id) {
            appendSingleMessageToChatUI(payload.new);
        } else {
            if (currentUser.role === 'vendor' && payload.new.sender === 'client') {
                showPremiumNotification("Mensagem", `Cliente: ${payload.new.text.slice(0, 25)}`, "success"); 
                tocarAlertaSonoroPedido();
                dispararNotificacaoNativa("Nova Mensagem", `Ordem #${payload.new.order_id}: ${payload.new.text}`);
            } 
            else if (currentUser.role === 'client' && payload.new.sender === 'admin') {
                showPremiumNotification("Suporte", payload.new.text.slice(0, 30), "success");
                tocarAlertaSonoroPedido();
                dispararNotificacaoNativa("Loja respondeu", payload.new.text);
            }
        }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pods_products' }, () => {
        fetchAndRenderStore();
        if (document.querySelector('#view-gerenciar.active')) renderAdminInventoryManager();
        if (document.querySelector('#view-super-inventory.active')) renderSuperGlobalInventory();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'store_status' }, (payload) => { 
        syncStoreStatusInterface(payload.new.is_open); 
    })
    .subscribe();
}

function switchView(view) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById('client-nav-tabs').style.display = currentUser.role === 'client' ? 'flex' : 'none';
    document.getElementById('admin-nav-tabs').style.display = currentUser.role === 'vendor' ? 'flex' : 'none';
    document.getElementById('super-nav-tabs').style.display = currentUser.role === 'superadmin' ? 'flex' : 'none';

    if(view === 'loja') { document.getElementById('view-loja').classList.add('active'); fetchAndRenderStore(); }
    else if (view === 'historico') { document.getElementById('view-historico').classList.add('active'); renderClientHistory(); }
    else if (view === 'admin') { document.getElementById('view-admin').classList.add('active'); renderAdminOrders(); }
    else if (view === 'gerenciar') { document.getElementById('view-gerenciar').classList.add('active'); renderAdminInventoryManager(); }
    else if (view === 'clientes') { document.getElementById('view-clientes').classList.add('active'); renderAdminClientsManager(); }
    else if (view === 'super-companies') { document.getElementById('view-super-companies').classList.add('active'); renderSuperCompaniesManager(); }
    else if (view === 'super-inventory') { document.getElementById('view-super-inventory').classList.add('active'); renderSuperGlobalInventory(); }
}

async function fetchAndRenderStore() {
    const containerGeral = document.getElementById('products-container-client'); if(!containerGeral) return;
    const { data: products } = await supabaseClient.from('pods_products').select('*').eq('company_id', currentUser.company_id).order('name', { ascending: true });
    if(products) { globalProductsCache = products; filterStoreData(); }
}

function filterStoreData() {
    const query = document.getElementById('store-search-input').value.toLowerCase().trim();
    const containerGeral = document.getElementById('products-container-client'); if(!containerGeral) return;
    containerGeral.innerHTML = '';
    globalProductsCache.forEach(p => {
        if(p.name.toLowerCase().includes(query)) {
            containerGeral.innerHTML += `
    <div class="product-card" onclick="openDetailsModal(${p.id})">
        <div class="product-img" style="${p.image ? `background-image: url('${p.image}');` : ''} background-size: cover; background-position: center; background-repeat: no-repeat;"></div>
        <h3 class="product-title">${p.name}</h3>
        <p class="product-info">💨 ${p.puffs} Puffs</p>
        <span class="stock-badge ${p.stock > 0 ? 'available' : 'out-of-stock'}">
            ${p.stock > 0 ? 'Disponível ('+p.stock+')' : 'Esgotado'}
        </span>
        <div class="price-tag" style="margin-top:10px;">R$ ${p.price.toFixed(2)}</div>
    </div>`;
        }
    });
}
function setCategoryFilter(cat) { currentCategoryFilter = cat; filterStoreData(); }

async function openDetailsModal(productId) {
    const { data: product } = await supabaseClient.from('pods_products').select('*').eq('id', productId).single();
    if(!product) return;
    
    openedProductData = product;
    
    // 1. Atualiza o título e textos
    document.getElementById('details-modal-title').innerText = product.name;
    document.getElementById('details-modal-puffs').innerText = `💨 Autonomia: ${product.puffs} Puffs`;
    document.getElementById('details-modal-price').innerText = `R$ ${product.price.toFixed(2)}`;
    
    // 2. A MÁGICA DA IMAGEM: Aplica o estilo de background no div da imagem
    const imgDiv = document.getElementById('details-modal-img');
    if (imgDiv) {
        // Garantimos que ele vai buscar a URL que você salvou no banco
        imgDiv.style.backgroundImage = `url('${product.image}')`;
        imgDiv.style.backgroundSize = 'cover';
        imgDiv.style.backgroundPosition = 'center';
    }

    // 3. Sabores
    const flavorsDiv = document.getElementById('details-modal-flavors'); flavorsDiv.innerHTML = '';
    product.flavors.forEach(f => { flavorsDiv.innerHTML += `<button type="button" class="flavor-btn">${f}</button>`; });
    
    document.getElementById('details-modal').style.display = 'flex';
    document.getElementById('details-action-btn').onclick = () => { closeDetailsModal(); openBuyModal(product); };
}
function closeDetailsModal() { document.getElementById('details-modal').style.display = 'none'; }

function openBuyModal(product) {
    selectedFlavor = null; resetHoldButton();
    const warningBox = document.getElementById('checkout-closed-warning'); if(warningBox) warningBox.style.display = isStoreOpenGlobal ? 'none' : 'block';
    const buttonsContainer = document.getElementById('flavor-buttons-container'); buttonsContainer.innerHTML = '';
    product.flavors.forEach(f => { buttonsContainer.innerHTML += `<button type="button" class="flavor-btn" onclick="selectFlavorBtn(this, '${f}')">${f}</button>`; });
    document.getElementById('summary-prod-price').innerText = `R$ ${product.price.toFixed(2)}`;
    document.getElementById('summary-delivery-price').innerText = `R$ ${currentUser.delivery_fee.toFixed(2)}`;
    document.getElementById('summary-total-price').innerText = `R$ ${(product.price + currentUser.delivery_fee).toFixed(2)}`;
    document.getElementById('buy-modal').style.display = 'flex';
}
function selectFlavorBtn(el, f) { document.querySelectorAll('#flavor-buttons-container .flavor-btn').forEach(b => b.classList.remove('selected')); el.classList.add('selected'); selectedFlavor = f; }
function closeModal() { document.getElementById('buy-modal').style.display = 'none'; }

function setupHoldToBuyButton() {
    const trigger = document.getElementById('btn-hold-trigger'); if(!trigger) return;
    trigger.addEventListener('touchstart', startHolding, { passive: true }); trigger.addEventListener('touchend', stopHolding);
    trigger.addEventListener('mousedown', startHolding); trigger.addEventListener('mouseup', stopHolding);
}
function startHolding() {
    if(!selectedFlavor || document.getElementById('client-address').value.trim() === "") return;
    const fillBar = document.getElementById('hold-progress-fill'); const btnLabel = document.getElementById('hold-btn-label');
    btnLabel.innerText = "Faturando ordem..."; holdProgress = 0; clearInterval(holdTimer);
    holdTimer = setInterval(() => {
        holdProgress += 4;
        if (holdProgress >= 100) { fillBar.style.width = '100%'; clearInterval(holdTimer); executeOrderCheckoutProcess(); } 
        else { fillBar.style.width = holdProgress + '%'; }
    }, 50);
}
function stopHolding() { clearInterval(holdTimer); if(holdProgress < 100) resetHoldButton(); }
function resetHoldButton() { document.getElementById('hold-progress-fill').style.width = '0%'; document.getElementById('hold-btn-label').innerText = "Segure para Confirmar Ordem"; }

async function executeOrderCheckoutProcess() {
    const prod = openedProductData;
    await supabaseClient.from('pods_products').update({ stock: prod.stock - 1 }).eq('id', prod.id);
    const address = sanitizeInput(document.getElementById('client-address').value);
    await supabaseClient.from('pods_orders').insert([{
        client_name: currentUser.name, client_phone: currentUser.phone, client_address: address, product_name: prod.name, flavor: selectedFlavor,
        product_price: prod.price, delivery_price: currentUser.delivery_fee, total_price: prod.price + currentUser.delivery_fee, status: isStoreOpenGlobal ? 'recebido' : 'fechado', company_id: currentUser.company_id
    }]);
    showPremiumNotification("Sucesso", "Seu pedido foi sincronizado na loja.", "success");
    closeModal(); fetchAndRenderStore();
}

async function openChatBoxModal(orderId) {
    activeChatOrderId = orderId; document.getElementById('chat-modal').style.display = 'flex';
    const { data: messages } = await supabaseClient.from('pods_messages').select('*').eq('order_id', orderId).order('id', { ascending: true });
    const body = document.getElementById('chat-messages-body'); body.innerHTML = '';
    if(messages) messages.forEach(msg => appendSingleMessageToChatUI(msg));
}
function appendSingleMessageToChatUI(msg) {
    const body = document.getElementById('chat-messages-body'); if(!body) return;
    const isMe = (currentUser.role !== 'client' && msg.sender === 'admin') || (currentUser.role === 'client' && msg.sender === 'client');
    body.innerHTML += `<div class="chat-bubble ${isMe ? 'me' : 'other'}">${msg.text}</div>`;
    body.scrollTop = body.scrollHeight; 
}
async function handleSendChatMessage(e) {
    e.preventDefault(); const field = document.getElementById('chat-input-field'); const txt = sanitizeInput(field.value.trim()); if(!txt) return; field.value = '';
    await supabaseClient.from('pods_messages').insert([{ order_id: activeChatOrderId, sender: currentUser.role === 'client' ? 'client' : 'admin', text: txt, company_id: currentUser.company_id }]);
}
function closeChatModal() { document.getElementById('chat-modal').style.display = 'none'; activeChatOrderId = null; }

async function renderClientHistory() {
    const container = document.getElementById('client-orders-container');
    const { data: orders } = await supabaseClient.from('pods_orders').select('*').eq('client_phone', currentUser.phone).eq('company_id', currentUser.company_id);
    if(!orders || orders.length === 0) { container.innerHTML = '<p style="color:var(--text-muted)">Nenhuma ordem ativa.</p>'; return; }
    container.innerHTML = '';
    orders.reverse().forEach(o => {
        container.innerHTML += `<div class="order-card"><div class="order-header"><strong>ORDEM #${o.id}</strong> <span>${o.status.toUpperCase()}</span></div><p style="margin-top:8px;">1x ${o.product_name} [${o.flavor}]</p><button class="btn-adm-status current" onclick="openChatBoxModal(${o.id})" style="margin-top:10px; width:100%;">💬 Abrir Chat com Suporte</button></div>`;
    });
}

// ====================================================
// 🏬 VISÃO DO LOJISTA
// ====================================================
async function renderAdminOrders() {
    const container = document.getElementById('orders-container');
    const { data: orders } = await supabaseClient.from('pods_orders').select('*').eq('company_id', currentUser.company_id).order('id', { ascending: false });
    if(!orders || orders.length === 0) { container.innerHTML = '<p style="color:var(--text-muted)">Sem pedidos para a sua loja.</p>'; return; }
    container.innerHTML = '';
    orders.forEach(o => {
        const statusAtual = o.status || 'recebido';
        let cardStyleExtra = statusAtual === 'fechado' ? 'style="border-left-color: var(--warning); background: rgba(255,159,10,0.02);"' : '';
        container.innerHTML += `
            <div class="order-card" id="order-card-adm-${o.id}" ${cardStyleExtra}>
                <div class="order-header"><strong>ORDEM #${o.id}</strong> <span style="color: var(--primary); font-weight:bold;">${statusAtual.toUpperCase()}</span></div>
                <div class="order-body" style="margin-top: 8px;">
                    <p><strong>Cliente:</strong> ${o.client_name} [${o.client_phone}]</p><p><strong>Destino:</strong> ${o.client_address}</p><p style="color: var(--primary); margin: 6px 0;"><strong>Item:</strong> 1x ${o.product_name} (${o.flavor})</p>
                    <p style="font-weight:600; margin-bottom:12px;">Faturamento: R$ ${Number(o.total_price).toFixed(2)}</p>
                    <div class="adm-wait-input-group" style="display:flex; gap:5px; margin-bottom:12px;">
                        <input type="text" id="adm-wait-time-${o.id}" placeholder="Ex: 30 min" value="${o.wait_time || ''}" style="flex:1; padding:8px; background:var(--input-bg); border:1px solid var(--border); color:#fff; border-radius:4px;">
                        <button onclick="updateOrderWaitTime(${o.id})" style="padding:8px 12px; background:var(--primary); color:#000; border:none; border-radius:4px; font-weight:700; cursor:pointer;">Fixar</button>
                    </div>
                    <div class="adm-status-row" style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px;">
                        <button class="btn-adm-status ${statusAtual === 'recebido' ? 'current' : ''}" onclick="updateStatus(${o.id}, 'recebido')">Aceitar</button>
                        <button class="btn-adm-status ${statusAtual === 'preparando' ? 'current' : ''}" onclick="updateStatus(${o.id}, 'preparando')">Preparar</button>
                        <button class="btn-adm-status ${statusAtual === 'rota' ? 'current' : ''}" onclick="updateStatus(${o.id}, 'rota')">Em Rota</button>
                        <button class="btn-adm-status" onclick="moveOrderToFinalHistory(${o.id})" style="background:var(--success); color:#000; border:none;">Concluir</button>
                    </div>
                    <button class="buy-btn-premium" onclick="openChatBoxModal(${o.id})" style="margin-top: 10px; background: var(--input-bg); border: 1px solid var(--border); padding: 12px; color: #fff; width:100%; font-size:12px;">💬 Abrir Chat</button>
                </div>
            </div>`;
    });
}
async function updateOrderWaitTime(orderId) { await supabaseClient.from('pods_orders').update({ wait_time: document.getElementById(`adm-wait-time-${orderId}`).value.trim() }).eq('id', orderId); showPremiumNotification("Salvo", "Tempo atualizado.", "success"); }
async function updateStatus(id, st) { await supabaseClient.from('pods_orders').update({ status: st }).eq('id', id); }
async function moveOrderToFinalHistory(orderId) {
    const { data: order } = await supabaseClient.from('pods_orders').select('*').eq('id', orderId).single(); if(!order) return;
    const { error } = await supabaseClient.from('pods_history').insert([{ ...order, status: 'concluido', wait_time: '' }]);
    if(!error) { await supabaseClient.from('pods_orders').delete().eq('id', orderId); showPremiumNotification("Concluída", "Pedido arquivado.", "success"); }
}
async function renderAdminInventoryManager() {
    const container = document.getElementById('admin-inventory-container'); container.innerHTML = '';
    const { data: prods } = await supabaseClient.from('pods_products').select('*').eq('company_id', currentUser.company_id);
    if(prods) prods.forEach(p => {
        container.innerHTML += `<div class="inventory-card"><h4>${p.name}</h4><div class="inventory-row-edit"><div><label>Preço</label><input type="number" step="0.01" id="inv-p-${p.id}" value="${p.price}"></div><div><label>Estoque</label><input type="number" id="inv-s-${p.id}" value="${p.stock}"></div></div><button class="btn-save-inline" onclick="saveInv(${p.id})">Salvar</button></div>`;
    });
}
async function saveProduct(e) {
    e.preventDefault();
    const fileInput = document.getElementById('prod-image-file');
    const file = fileInput.files[0];
    
    if (!file) {
        showPremiumNotification("Erro", "Selecione uma foto do produto!", "error");
        return;
    }

    // Feedback visual para o lojista
    const btn = e.target.querySelector('button');
    const originalText = btn.innerText;
    btn.innerText = "Processando arquivo...";
    btn.disabled = true;

    try {
        // 1. Upload para o Storage 'pods'
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('pods')
            .upload(fileName, file);

        if (uploadError) throw uploadError;

        // 2. Obter URL pública
        const { data: publicUrlData } = supabaseClient.storage.from('pods').getPublicUrl(fileName);
        const publicUrl = publicUrlData.publicUrl;

        // 3. Inserir dados no banco
        const { error: insertError } = await supabaseClient.from('pods_products').insert([{ 
            name: sanitizeInput(document.getElementById('prod-name').value), 
            puffs: parseInt(document.getElementById('prod-puffs').value), 
            price: parseFloat(document.getElementById('prod-price').value), 
            stock: parseInt(document.getElementById('prod-stock').value), 
            flavors: document.getElementById('prod-flavors').value.split(',').map(f => f.trim()), 
            image: publicUrl, // Link que criamos acima
            company_id: currentUser.company_id 
        }]);

        if (insertError) throw insertError;

        showPremiumNotification("Sucesso", "Produto publicado!", "success");
        document.getElementById('product-form').reset();
    } catch (err) {
        console.error("Erro ao salvar produto:", err);
        showPremiumNotification("Erro", "Falha ao publicar. Verifique as permissões do Storage.", "error");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}
async function renderAdminClientsManager() {
    const container = document.getElementById('admin-clients-container'); container.innerHTML = '';
    const { data: users } = await supabaseClient.from('pods_users').select('*').eq('company_id', currentUser.company_id);
    if(users) users.forEach(u => { container.innerHTML += `<div class="client-profile-card"><h4>👥 ${u.name}</h4><p>WhatsApp: ${u.phone}</p></div>`; });
}

// ====================================================
// 👑 VISÃO MASTER DO SUPER ADM
// ====================================================
async function saveNewCompanyMaster(e) {
    e.preventDefault();
    const { error } = await supabaseClient.from('pods_companies').insert([{ name: sanitizeInput(document.getElementById('comp-name').value), invite_code: document.getElementById('comp-code').value.trim(), delivery_fee: parseFloat(document.getElementById('comp-fee').value), phone_adm: document.getElementById('comp-phone').value.trim(), password_adm: document.getElementById('comp-password').value, status: 'active' }]);
    if(!error) { showPremiumNotification("Sucesso", "Franquia Ativada!", "success"); document.getElementById('company-form').reset(); renderSuperCompaniesManager(); } else { showPremiumNotification("Erro", "Código/Telefone já em uso.", "error"); }
}
async function renderSuperCompaniesManager() {
    const container = document.getElementById('super-companies-list'); if(!container) return;
    const { data: companies } = await supabaseClient.from('pods_companies').select('*').order('id', { ascending: false });
    if(!companies || companies.length === 0) { container.innerHTML = '<p style="color:var(--text-muted)">Nenhuma empresa.</p>'; return; }
    container.innerHTML = '';
    companies.forEach(c => {
        const isBlocked = c.status === 'blocked';
        container.innerHTML += `<div class="inventory-card" style="border-left: 4px solid ${isBlocked ? 'var(--danger)' : 'var(--success)'};"><div style="display:flex; justify-content:space-between; align-items:center;"><h4>${c.name}</h4><span style="font-size:10px; font-weight:900; padding:2px 6px; border-radius:4px; background:${isBlocked ? 'var(--danger)' : 'var(--success)'}; color:#000;">${c.status.toUpperCase()}</span></div><p style="font-size:12px; margin: 6px 0; color:var(--text-muted);">🔑 Convite: <strong style="color:var(--primary)">${c.invite_code}</strong> | 🛵 Frete: R$ ${c.delivery_fee.toFixed(2)}<br>📱 Dono: ${c.phone_adm} | 🔐 Senha: ${c.password_adm}</p><div class="inventory-row-edit" style="grid-template-columns: 1fr; margin-top:10px;"><button class="btn-adm-status" style="background:${isBlocked ? 'var(--success)' : 'var(--danger)'}; color:#fff; font-weight:700;" onclick="toggleCompanyBlockMaster(${c.id}, '${c.status}')">${isBlocked ? '🟢 Desbloquear Loja' : '🔴 Bloquear Loja'}</button></div></div>`;
    });
}
async function toggleCompanyBlockMaster(id, currentStatus) { await supabaseClient.from('pods_companies').update({ status: currentStatus === 'active' ? 'blocked' : 'active' }).eq('id', id); renderSuperCompaniesManager(); }
async function renderSuperGlobalInventory() {
    const container = document.getElementById('super-global-inventory-container'); if(!container) return; container.innerHTML = '';
    const { data: products } = await supabaseClient.from('pods_products').select('*, pods_companies(name)');
    if(products) products.forEach(p => { container.innerHTML += `<div class="inventory-card" style="border-left: 2px solid var(--border);"><span style="font-size:10px; color:var(--primary); font-weight:700;">🏬 LOJA: ${p.pods_companies ? p.pods_companies.name.toUpperCase() : "N/A"}</span><h4 style="margin-top:3px;">${p.name}</h4><p style="font-size:12px; color:var(--text-muted)">Estoque: <strong>${p.stock}</strong> | R$ ${p.price.toFixed(2)}</p></div>`; });
}

// ====================================================
// 📲 MOTOR DE INSTALAÇÃO DE APP (PWA)
// ====================================================
let instaladorPWA;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    instaladorPWA = e;
    mostrarBotaoInstalarApp();
});

function mostrarBotaoInstalarApp() {
    let btnInstalar = document.getElementById('btn-instalar-pwa');
    
    if (!btnInstalar) {
        btnInstalar = document.createElement('button');
        btnInstalar.id = 'btn-instalar-pwa';
        btnInstalar.innerHTML = '📲 Baixar App';
        btnInstalar.style.cssText = `
            position: fixed;
            bottom: 25px;
            right: 25px;
            z-index: 999999;
            background: var(--primary, #00DFD8);
            color: #000;
            padding: 12px 24px;
            border-radius: 50px;
            font-weight: 900;
            border: none;
            box-shadow: 0 5px 20px rgba(0, 223, 216, 0.4);
            cursor: pointer;
            text-transform: uppercase;
            font-size: 13px;
            animation: pulse-pwa 2s infinite;
        `;
        
        const style = document.createElement('style');
        style.innerHTML = `@keyframes pulse-pwa { 0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(0, 223, 216, 0.7); } 70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(0, 223, 216, 0); } 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(0, 223, 216, 0); } }`;
        document.head.appendChild(style);

        document.body.appendChild(btnInstalar);

        btnInstalar.addEventListener('click', async () => {
            if (instaladorPWA) {
                instaladorPWA.prompt(); 
                const { outcome } = await instaladorPWA.userChoice;
                if (outcome === 'accepted') {
                    btnInstalar.style.display = 'none';
                }
                instaladorPWA = null;
            }
        });
    } else {
        btnInstalar.style.display = 'block';
    }
}