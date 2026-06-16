// CONFIGURAÇÕES DO SEU SUPABASE
const SUPABASE_URL = "https://wcjzrdovqnyytveospck.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjanpyZG92cW55eXR2ZW9zcGNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExOTExNDcsImV4cCI6MjA5Njc2NzE0N30.cSXeFxYnD24yNP-zIlhIONLsHx-oVDRg8OI9aSEL7oY";

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
window.supabaseClient = supabaseClient;

let currentUser = null; // Guarda: user_id, name, phone, role ('client', 'vendor', 'superadmin'), company_id, delivery_fee
let currentCompanyData = null; // Informações da loja logada ou da loja do cliente
let authMode = "login";
let selectedFlavor = null;
let currentProductFile = null; 
let openedProductData = null;
let globalProductsCache = []; 
let currentCategoryFilter = "all";

// Controle global do Chat Ativo e expediente
let activeChatOrderId = null;
let isStoreOpenGlobal = true;

// Variáveis de controle para o Hold Trigger
let holdTimer = null;
let holdProgress = 0;
const HOLD_DURATION = 1500; 

let realtimeChannel = null;

// ====================================================
// 🎵 MOTOR DE ÁUDIO NATIVO (SIRENE INSTANTÂNEA)
// ====================================================
function tocarAlertaSonoroPedido() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Oscilador 1 (Tom Principal)
        const oscilador1 = audioCtx.createOscillator();
        const ganho1 = audioCtx.createGain();
        oscilador1.type = 'sine';
        oscilador1.frequency.setValueAtTime(880, audioCtx.currentTime); // Nota Lá (Aguda)
        
        ganho1.gain.setValueAtTime(0.3, audioCtx.currentTime);
        oscilador1.connect(ganho1);
        ganho1.connect(audioCtx.destination);
        
        oscilador1.start();
        oscilador1.stop(audioCtx.currentTime + 1.2);
        
        console.log("🔔 [AUDIO ENGINE] Alerta sonoro disparado com sucesso!");
    } catch (e) {
        console.error("Erro ao reproduzir som de alerta:", e);
    }
}

// ====================================================
// 🍪 COOKIES ENGINE
// ====================================================
function setCookie(name, value, days = 7) {
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = "expires=" + d.toUTCString();
    document.cookie = name + "=" + encodeURIComponent(value) + ";" + expires + ";path=/;SameSite=Strict";
}

function getCookie(name) {
    const cname = name + "=";
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i].trim();
        if (c.indexOf(cname) == 0) return c.substring(cname.length, c.length);
    }
    return "";
}

function deleteCookie(name) { document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"; }

// ====================================================
// 🚨 SISTEMA FORÇADO DE VERIFICAÇÃO DE NOTIFICAÇÕES (MOBILE UPDATE)
// ====================================================
async function verificarEForcarPermissaoNotificacao() {
    if (!currentUser || currentUser.role !== 'client') return;

    if ('serviceWorker' in navigator && 'Notification' in window) {
        try {
            // Registra o service worker PRIMEIRO para o celular liberar o recurso nas configurações
            const reg = await navigator.serviceWorker.register('/sw.js');
            console.log("[Service Worker] Registrado com sucesso para escopo de push.");

            if (Notification.permission === 'default') {
                // Exibe o seu aviso vermelho premium na tela
                showPremiumNotification(
                    "📢 ATENÇÃO: Habilite as Notificações", 
                    "Para garantir que seu pedido chegue rápido, permita as notificações a seguir. Caso não aceite, você poderá ter sérios problemas com o recebimento e rastreio da sua entrega devido à falta de comunicação em tempo real!", 
                    "error"
                );

                // Aguarda a leitura e força a janelinha nativa através do registro do Service Worker
                setTimeout(async () => {
                    const permission = await Notification.requestPermission();
                    if (permission === 'granted') {
                        showPremiumNotification("🔄 Conexão Ativada", "Notificações sincronizadas com sucesso. Seu frete está seguro!", "success");
                        inicializarNotificacoesPush(currentUser.phone);
                    }
                }, 3500);
            } 
            else if (Notification.permission === 'granted') {
                // Se já foi aceito antes, só garante a sincronização do token do Firebase
                inicializarNotificacoesPush(currentUser.phone);
            }
            else if (Notification.permission === 'denied') {
                showPremiumNotification(
                    "⚠️ Alerta de Rastreamento", 
                    "Você bloqueou as notificações. Isso causará sérias falhas de comunicação na entrega. Ative manualmente nas configurações do navegador.", 
                    "error"
                );
            }
        } catch (err) {
            console.error("Erro ao instanciar barreira de push no mobile:", err);
        }
    }
}

window.onload = function() {
    const savedUserCookie = getCookie('logged_user');
    if(savedUserCookie) {
        currentUser = JSON.parse(savedUserCookie);
        logUserIn(currentUser);
    }
    setupHoldToBuyButton();
}

function sanitizeInput(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

function showPremiumNotification(title, message, type = "success") {
    const modal = document.getElementById('notification-modal');
    const cardBox = document.getElementById('notification-card-box');
    const icon = document.getElementById('notification-icon');
    if(!modal || !cardBox || !icon) return;
    document.getElementById('notification-title').innerText = title;
    document.getElementById('notification-message').innerText = message;
    cardBox.className = "alert-popup animate-fade-in " + (type === "success" ? "success-alert" : "error-alert");
    icon.innerText = type === "success" ? "✓" : "✕";
    modal.setAttribute("style", "display: flex !important;");
}

function closeNotificationModal() { document.getElementById('notification-modal').style.display = 'none'; }

function setAuthMode(mode) {
    authMode = mode;
    const btnLogin = document.getElementById('btn-mode-login');
    const btnRegister = document.getElementById('btn-mode-register');
    
    if(mode === 'login') {
        btnLogin.classList.add('active'); btnRegister.classList.remove('active');
        document.getElementById('group-auth-name').style.display = 'none';
        
        const vipField = document.getElementById('group-vip-field');
        if(vipField) {
            vipField.style.display = 'none';
            const vipInput = document.getElementById('auth-vip-code');
            if(vipInput) vipInput.removeAttribute('required');
        }
        document.getElementById('auth-submit-btn').innerText = "Acessar Hub";
    } else {
        btnRegister.classList.add('active'); btnLogin.classList.remove('active');
        document.getElementById('group-auth-name').style.display = 'block';
        
        let vipField = document.getElementById('group-vip-field');
        if(!vipField) {
            const div = document.createElement('div');
            div.className = 'form-group'; div.id = 'group-vip-field';
            div.innerHTML = `<label>Código de Indicação da Loja</label><input type="text" id="auth-vip-code" placeholder="Insira o código fornecido pelo lojista" required>`;
            document.getElementById('auth-form').insertBefore(div, document.getElementById('auth-submit-btn'));
        } else { 
            vipField.style.display = 'block';
            const vipInput = document.getElementById('auth-vip-code');
            if(vipInput) vipInput.setAttribute('required', 'required');
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
        logUserIn(currentUser);
        showPremiumNotification("Modo Deus", "Painel de controle central de franquias liberado.", "success");
        return;
    }

    if (authMode === 'login') {
        const { data: vendorStore } = await supabaseClient.from('pods_companies').select('*').eq('phone_adm', phoneInput).eq('password_adm', passwordInput).maybeSingle();
        if(vendorStore) {
            if(vendorStore.status === 'blocked') {
                showPremiumNotification("Acesso Bloqueado", "Sua mensalidade de R$50,00 está vencida. Fale com o suporte master.", "error");
                return;
            }
            currentUser = { name: vendorStore.name, phone: phoneInput, role: "vendor", company_id: vendorStore.id, delivery_fee: vendorStore.delivery_fee };
            setCookie('logged_user', JSON.stringify(currentUser), 7);
            logUserIn(currentUser);
            return;
        }

        const { data: userFound } = await supabaseClient.from('pods_users').select('*, pods_companies(status, name, delivery_fee)').eq('phone', phoneInput).eq('password', passwordInput).maybeSingle();
        if (userFound) {
            if(userFound.pods_companies && userFound.pods_companies.status === 'blocked') {
                showPremiumNotification("Sistema Indisponível", "A loja vinculada a este convite está em manutenção.", "error");
                return;
            }
            currentUser = { name: userFound.name, phone: userFound.phone, role: "client", company_id: userFound.company_id, delivery_fee: userFound.pods_companies.delivery_fee };
            currentCompanyData = userFound.pods_companies;
            setCookie('logged_user', JSON.stringify(currentUser), 7);
            logUserIn(currentUser);
        } else { 
            showPremiumNotification("Falha no Acesso", "Credenciais incorretas ou loja inexistente.", "error");
        }
    } else {
        const inviteCode = document.getElementById('auth-vip-code').value.trim();
        const { data: targetCompany } = await supabaseClient.from('pods_companies').select('*').eq('invite_code', inviteCode).maybeSingle();
        
        if (!targetCompany || targetCompany.status === 'blocked') {
            showPremiumNotification("Código Inválido", "Esta loja parceira não está credenciada ou foi suspensa.", "error");
            return;
        }

        const nameInput = sanitizeInput(document.getElementById('auth-name').value.trim());
        const { data: existingUser } = await supabaseClient.from('pods_users').select('phone').eq('phone', phoneInput).maybeSingle();
        if (existingUser) { showPremiumNotification("Aviso", "Este número de WhatsApp já possui cadastro ativo.", "error"); return; }

        const { error } = await supabaseClient.from('pods_users').insert([{ phone: phoneInput, name: nameInput, password: passwordInput, company_id: targetCompany.id }]);
        if (!error) {
            showPremiumNotification("Membro Registrado!", `Sua conta foi criada no ecossistema da ${targetCompany.name}.`, "success");
            currentUser = { name: nameInput, phone: phoneInput, role: "client", company_id: targetCompany.id, delivery_fee: targetCompany.delivery_fee };
            setCookie('logged_user', JSON.stringify(currentUser), 7);
            logUserIn(currentUser);
        }
    }
}

async function logUserIn(user) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    document.getElementById('user-display-name').innerText = user.name;

    const titleDisp = document.getElementById('store-title-display');
    const subtDisp = document.getElementById('store-vendor-subtitle');

    if(user.role === 'superadmin') {
        titleDisp.innerText = "HUB MESTRE"; subtDisp.innerText = "Gerenciamento Geral de Lojas";
        switchView('super-companies');
    } else if (user.role === 'vendor') {
        titleDisp.innerText = user.name.toUpperCase(); subtDisp.innerText = "Painel Administrativo do Lojista";
        switchView('admin');
    } else {
        titleDisp.innerText = "PODS STORE"; subtDisp.innerText = "Catálogo Exclusivo Privado";
        switchView('loja');
        
        // Executa a checagem forçada e registro assim que o cliente loga
        verificarEForcarPermissaoNotificacao();
    }
    fetchStoreStatusInitial(); 
    setupRealtimeListeners(); 
}

function handleLogout() {
    if (realtimeChannel) { supabaseClient.removeChannel(realtimeChannel); }
    deleteCookie('logged_user'); currentUser = null;
    document.getElementById('main-content').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('auth-form').reset(); setAuthMode('login');
}

// ====================================================
// 🔔 SINCRONIZAÇÃO DO TOKEN VAPID COM FIREBASE
// ====================================================
async function inicializarNotificacoesPush(userPhone) {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.getRegistration();
            if (!registration) return;
            
            if (Notification.permission === 'granted') {
                if (!window.firebase) await carregarBibliotecasFirebase();

                const config = {
                    apiKey: "AIzaSyDd7s3h6-TPleYJ590yKKCKalENyVwtCMg",
                    authDomain: "rei-dos-pods.firebaseapp.com",
                    projectId: "rei-dos-pods",
                    storageBucket: "rei-dos-pods.firebasestorage.app",
                    messagingSenderId: "763358246928",
                    appId: "1:763358246928:web:ff3101060d43b737087295"
                };

                if (!firebase.apps.length) firebase.initializeApp(config);
                const messaging = firebase.messaging();

                const token = await messaging.getToken({
                    serviceWorkerRegistration: registration,
                    vapidKey: 'BJN313FYRPWo4rdGUyoJThln_8Yku22BNr50pisWcUyyGrWty43ySpvaBzESO4Cbpq-0nJidFZTTe-7p2HQ4jyk'
                });

                if (token) {
                    await supabaseClient.from('pods_users').update({ push_token: token }).eq('phone', userPhone);
                    console.log("🔥 [PUSH ENGINE] Token sincronizado com sucesso no Supabase:", token);
                }
            }
        } catch (e) { console.error('Erro push engine:', e); }
    }
}

function carregarBibliotecasFirebase() {
    return new Promise((resolve) => {
        const scriptApp = document.createElement('script'); scriptApp.src = "https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js";
        document.head.appendChild(scriptApp);
        scriptApp.onload = () => {
            const scriptMsg = document.createElement('script'); scriptMsg.src = "https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js";
            document.head.appendChild(scriptMsg); scriptMsg.onload = () => resolve();
        };
    });
}

function syncStoreStatusInterface(isOpen) {
    isStoreOpenGlobal = isOpen;
    const badge = document.getElementById('store-status-badge');
    if(badge) {
        badge.innerText = isOpen ? "Aberto" : "Fechado";
        badge.className = "status-badge-premium " + (isOpen ? "aberto" : "fechado");
    }
}

async function fetchStoreStatusInitial() {
    const { data } = await supabaseClient.from('store_status').select('is_open').eq('id', 1).single();
    if(data) syncStoreStatusInterface(data.is_open);
}

async function toggleStoreStatus() {
    const novoEstado = !isStoreOpenGlobal;
    await supabaseClient.from('store_status').update({ is_open: novoEstado }).eq('id', 1);
}

// ====================================================
// 🎛️ ESCUTA EM TEMPO REAL COM ACIONAMENTO DE SIRENE
// ====================================================
function setupRealtimeListeners() {
    if (!supabaseClient) return;
    if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);

    realtimeChannel = supabaseClient.channel('custom-all-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pods_orders' }, (payload) => {
        const active = document.querySelector('.view-section.active');
        
        // Dispara o alerta sonoro instantâneo se a ordem pertencer à nossa loja
        if (payload.eventType === 'INSERT') {
            if (currentUser && payload.new.company_id === currentUser.company_id) {
                tocarAlertaSonoroPedido();
                showPremiumNotification("🚨 NOVO PEDIDO!", `Ordem #${payload.new.id} recebida! Toque para gerenciar.`, "success");
            }
        }

        if (!active) return;
        if (active.id === 'view-admin') renderAdminOrders();
        else if (active.id === 'view-historico') renderClientHistory();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pods_products' }, () => {
        fetchAndRenderStore();
        if (document.querySelector('#view-gerenciar.active')) renderAdminInventoryManager();
        if (document.querySelector('#view-super-inventory.active')) renderSuperGlobalInventory();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'store_status' }, (payload) => {
        syncStoreStatusInterface(payload.new.is_open);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pods_messages' }, (payload) => {
        if (document.getElementById('chat-modal').style.display === 'flex' && activeChatOrderId == payload.new.order_id) {
            appendSingleMessageToChatUI(payload.new);
        } else {
            if (currentUser.role === 'vendor' && payload.new.sender === 'client') {
                showPremiumNotification("Mensagem Recebida 💬", `Ordem #${payload.new.order_id}: ${payload.new.text.slice(0, 25)}`, "success");
                tocarAlertaSonoroPedido();
            } else if (currentUser.role === 'client' && payload.new.sender === 'admin') {
                showPremiumNotification("Suporte da Loja 👑", payload.new.text.slice(0, 30), "success");
            }
        }
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
    const containerGeral = document.getElementById('products-container-client');
    if(!containerGeral) return;
    
    let targetCompanyId = currentUser.company_id;
    const { data: products } = await supabaseClient.from('pods_products').select('*').eq('company_id', targetCompanyId).order('name', { ascending: true });
    if(!products) return;
    globalProductsCache = products;
    filterStoreData();
}

function filterStoreData() {
    const query = document.getElementById('store-search-input').value.toLowerCase().trim();
    const containerGeral = document.getElementById('products-container-client');
    if(!containerGeral) return;
    containerGeral.innerHTML = '';

    globalProductsCache.forEach(p => {
        if(p.name.toLowerCase().includes(query)) {
            let htmlPreco = `R$ ${p.price.toFixed(2)}`;
            const estiloImagem = p.image ? `style="background-image: url('${p.image}');"` : '';
            containerGeral.innerHTML += `
                <div class="product-card" onclick="openDetailsModal(${p.id})">
                    <div class="product-img" ${estiloImagem}></div>
                    <h3 class="product-title">${p.name}</h3>
                    <p class="product-info">💨 ${p.puffs} Puffs</p>
                    <span class="stock-badge available">${p.stock > 0 ? 'Disponível ('+p.stock+')' : 'Esgotado'}</span>
                    <div class="price-tag" style="margin-top:10px;">${htmlPreco}</div>
                </div>`;
        }
    });
}

function setCategoryFilter(cat) { currentCategoryFilter = cat; filterStoreData(); }

async function openDetailsModal(productId) {
    const { data: product } = await supabaseClient.from('pods_products').select('*').eq('id', productId).single();
    if(!product) return;
    openedProductData = product;
    document.getElementById('details-modal-title').innerText = product.name;
    document.getElementById('details-modal-puffs').innerText = `💨 Autonomia: ${product.puffs} Puffs`;
    document.getElementById('details-modal-price').innerText = `R$ ${product.price.toFixed(2)}`;
    const flavorsDiv = document.getElementById('details-modal-flavors'); flavorsDiv.innerHTML = '';
    product.flavors.forEach(f => { flavorsDiv.innerHTML += `<button type="button" class="flavor-btn">${f}</button>`; });
    document.getElementById('details-modal').style.display = 'flex';
    document.getElementById('details-action-btn').onclick = () => { closeDetailsModal(); openBuyModal(product); };
}

function closeDetailsModal() { document.getElementById('details-modal').style.display = 'none'; }

function openBuyModal(product) {
    selectedFlavor = null; resetHoldButton();
    const warningBox = document.getElementById('checkout-closed-warning');
    if(warningBox) warningBox.style.display = isStoreOpenGlobal ? 'none' : 'block';
    const buttonsContainer = document.getElementById('flavor-buttons-container'); buttonsContainer.innerHTML = '';
    product.flavors.forEach(f => { buttonsContainer.innerHTML += `<button type="button" class="flavor-btn" onclick="selectFlavorBtn(this, '${f}')">${f}</button>`; });
    
    document.getElementById('summary-prod-price').innerText = `R$ ${product.price.toFixed(2)}`;
    document.getElementById('summary-delivery-price').innerText = `R$ ${currentUser.delivery_fee.toFixed(2)}`;
    document.getElementById('summary-total-price').innerText = `R$ ${(product.price + currentUser.delivery_fee).toFixed(2)}`;
    document.getElementById('buy-modal').style.display = 'flex';
}

function selectFlavorBtn(el, f) {
    document.querySelectorAll('#flavor-buttons-container .flavor-btn').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected'); selectedFlavor = f;
}

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
        client_name: currentUser.name, client_phone: currentUser.phone, client_address: address,
        product_name: prod.name, flavor: selectedFlavor, product_price: prod.price,
        delivery_price: currentUser.delivery_fee, total_price: prod.price + currentUser.delivery_fee,
        status: isStoreOpenGlobal ? 'recebido' : 'fechado', company_id: currentUser.company_id
    }]);

    showPremiumNotification("Faturamento Completo", "Seu pedido foi sincronizado no painel da loja.", "success");
    closeModal(); fetchAndRenderStore();
}

async function openChatBoxModal(orderId) {
    activeChatOrderId = orderId;
    document.getElementById('chat-modal').style.display = 'flex';
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
    e.preventDefault(); const field = document.getElementById('chat-input-field'); const txt = sanitizeInput(field.value.trim());
    if(!txt) return; field.value = '';
    await supabaseClient.from('pods_messages').insert([{ order_id: activeChatOrderId, sender: currentUser.role === 'client' ? 'client' : 'admin', text: txt, company_id: currentUser.company_id }]);
}

function closeChatModal() { document.getElementById('chat-modal').style.display = 'none'; activeChatOrderId = null; }

async function renderClientHistory() {
    const container = document.getElementById('client-orders-container');
    const { data: orders } = await supabaseClient.from('pods_orders').select('*').eq('client_phone', currentUser.phone).eq('company_id', currentUser.company_id);
    if(!orders || orders.length === 0) { container.innerHTML = '<p style="color:var(--text-muted)">Nenhuma ordem ativa.</p>'; return; }
    container.innerHTML = '';
    orders.reverse().forEach(o => {
        container.innerHTML += `
            <div class="order-card">
                <div class="order-header"><strong>ORDEM #${o.id}</strong> <span>${o.status.toUpperCase()}</span></div>
                <p style="margin-top:8px;">1x ${o.product_name} [${o.flavor}]</p>
                <button class="btn-adm-status current" onclick="openChatBoxModal(${o.id})" style="margin-top:10px; width:100%;">💬 Abrir Chat com Suporte</button>
            </div>`;
    });
}

// ====================================================
// 🏬 VISÃO DO LOJISTA (ESTEIRA DE PRODUÇÃO COMPLETA)
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
                    <p><strong>Cliente:</strong> ${o.client_name} [${o.client_phone}]</p>
                    <p><strong>Destino:</strong> ${o.client_address}</p>
                    <p style="color: var(--primary); margin: 6px 0;"><strong>Item:</strong> 1x ${o.product_name} (${o.flavor})</p>
                    <p style="font-weight:600; margin-bottom:12px;">Faturamento: R$ ${Number(o.total_price).toFixed(2)}</p>
                    
                    <div class="adm-wait-input-group" style="display:flex; gap:5px; margin-bottom:12px;">
                        <input type="text" id="adm-wait-time-${o.id}" placeholder="Ex: 30-40 min" value="${o.wait_time || ''}" style="flex:1; padding:8px; background:var(--input-bg); border:1px solid var(--border); color:#fff; border-radius:4px;">
                        <button class="btn-save-wait" onclick="updateOrderWaitTime(${o.id})" style="padding:8px 12px; background:var(--primary); color:#000; border:none; border-radius:4px; font-weight:700; cursor:pointer;">Fixar</button>
                    </div>
                    
                    <div class="adm-status-row" style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px;">
                        <button class="btn-adm-status ${statusAtual === 'recebido' ? 'current' : ''}" onclick="updateStatus(${o.id}, 'recebido')">Aceitar</button>
                        <button class="btn-adm-status ${statusAtual === 'preparando' ? 'current' : ''}" onclick="updateStatus(${o.id}, 'preparando')">Preparar</button>
                        <button class="btn-adm-status ${statusAtual === 'rota' ? 'current' : ''}" onclick="updateStatus(${o.id}, 'rota')">Em Rota</button>
                        <button class="btn-adm-status" onclick="moveOrderToFinalHistory(${o.id})" style="background:var(--success); color:#000; border:none;">Concluir</button>
                    </div>
                    
                    <button class="buy-btn-premium" onclick="openChatBoxModal(${o.id})" style="margin-top: 10px; background: var(--input-bg); border: 1px solid var(--border); padding: 12px; color: #fff; width:100%; font-size:12px;">💬 Abrir Chat Anônimo com Cliente</button>
                </div>
            </div>`;
    });
}

async function updateOrderWaitTime(orderId) {
    const inputVal = document.getElementById(`adm-wait-time-${orderId}`).value.trim();
    await supabaseClient.from('pods_orders').update({ wait_time: inputVal }).eq('id', orderId);
    showPremiumNotification("Tempo Updated", "Previsão de entrega enviada ao cliente.", "success");
}

async function moveOrderToFinalHistory(orderId) {
    const { data: order } = await supabaseClient.from('pods_orders').select('*').eq('id', orderId).single();
    if(!order) return;
    
    const { error: insertError } = await supabaseClient.from('pods_history').insert([{
        client_name: order.client_name, client_phone: order.client_phone, client_address: order.client_address,
        product_name: order.product_name, flavor: order.flavor, product_price: order.product_price,
        delivery_price: order.delivery_price, total_price: order.total_price, status: 'concluido',
        wait_time: '', company_id: currentUser.company_id
    }]);
    
    if(!insertError) {
        await supabaseClient.from('pods_orders').delete().eq('id', orderId);
        showPremiumNotification("Ordem Concluída", "Pedido finalizado e enviado ao faturamento.", "success");
    }
}

async function updateStatus(id, st) { await supabaseClient.from('pods_orders').update({ status: st }).eq('id', id); }

async function renderAdminInventoryManager() {
    const container = document.getElementById('admin-inventory-container'); container.innerHTML = '';
    const { data: prods } = await supabaseClient.from('pods_products').select('*').eq('company_id', currentUser.company_id);
    if(prods) prods.forEach(p => {
        container.innerHTML += `
            <div class="inventory-card">
                <h4>${p.name}</h4>
                <div class="inventory-row-edit">
                    <div><label>Preço</label><input type="number" step="0.01" id="inv-p-${p.id}" value="${p.price}"></div>
                    <div><label>Estoque</label><input type="number" id="inv-s-${p.id}" value="${p.stock}"></div>
                </div>
                <button class="btn-save-inline" onclick="saveInv(${p.id})">Salvar</button>
            </div>`;
    });
}

async function saveInv(id) {
    const price = parseFloat(document.getElementById(`inv-p-${id}`).value);
    const stock = parseInt(document.getElementById(`inv-s-${id}`).value);
    await supabaseClient.from('pods_products').update({ price, stock }).eq('id', id);
    showPremiumNotification("Salvo", "Estoque modificado.", "success");
}

async function saveProduct(e) {
    e.preventDefault();
    const name = sanitizeInput(document.getElementById('prod-name').value);
    const puffs = parseInt(document.getElementById('prod-puffs').value);
    const price = parseFloat(document.getElementById('prod-price').value);
    const stock = parseInt(document.getElementById('prod-stock').value);
    const flavors = document.getElementById('prod-flavors').value.split(',').map(f => f.trim());
    
    await supabaseClient.from('pods_products').insert([{ name, puffs, price, stock, flavors, is_promo:false, promo_price:0, company_id: currentUser.company_id }]);
    showPremiumNotification("Publicado", "Item adicionado ao seu catálogo.", "success");
    document.getElementById('product-form').reset();
}

async function renderAdminClientsManager() {
    const container = document.getElementById('admin-clients-container'); container.innerHTML = '';
    const { data: users } = await supabaseClient.from('pods_users').select('*').eq('company_id', currentUser.company_id);
    if(users) users.forEach(u => { container.innerHTML += `<div class="client-profile-card"><h4>👥 ${u.name}</h4><p>WhatsApp: ${u.phone}</p></div>`; });
}

// ====================================================
// 👑 VISÃO MASTER DO SUPER ADM (VOCÊ)
// ====================================================
async function saveNewCompanyMaster(e) {
    e.preventDefault();
    const name = sanitizeInput(document.getElementById('comp-name').value);
    const invite_code = document.getElementById('comp-code').value.trim();
    const delivery_fee = parseFloat(document.getElementById('comp-fee').value);
    const phone_adm = document.getElementById('comp-phone').value.trim();
    const password_adm = document.getElementById('comp-password').value;

    const { error } = await supabaseClient.from('pods_companies').insert([{ name, invite_code, delivery_fee, phone_adm, password_adm, status: 'active' }]);
    if(!error) {
        showPremiumNotification("Sucesso", "Nova Franquia Ativada no Hub!", "success");
        document.getElementById('company-form').reset();
        renderSuperCompaniesManager();
    } else { showPremiumNotification("Erro", "Código de convite ou Telefone já ocupado.", "error"); }
}

async function renderSuperCompaniesManager() {
    const container = document.getElementById('super-companies-list'); if(!container) return;
    container.innerHTML = '<p style="color:var(--text-muted)">Mapeando servidores...</p>';
    
    const { data: companies } = await supabaseClient.from('pods_companies').select('*').order('id', { ascending: false });
    if(!companies || companies.length === 0) { container.innerHTML = '<p style="color:var(--text-muted)">Nenhuma empresa franqueada ainda.</p>'; return; }
    
    container.innerHTML = '';
    companies.forEach(c => {
        const isBlocked = c.status === 'blocked';
        const cardStyle = isBlocked ? 'style="border-left: 4px solid var(--danger); background: rgba(255,59,48,0.02);"' : 'style="border-left: 4px solid var(--success);"';
        
        container.innerHTML += `
            <div class="inventory-card" ${cardStyle}>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h4 style="font-size:16px; color:#fff;">${c.name}</h4>
                    <span style="font-size:10px; font-weight:900; padding:2px 6px; border-radius:4px; background:${isBlocked ? 'var(--danger)' : 'var(--success)'}; color:#000;">
                        ${c.status.toUpperCase()}
                    </span>
                </div>
                <p style="font-size:12px; margin: 6px 0; color:var(--text-muted);">
                    🔑 Convite: <strong style="color:var(--primary)">${c.invite_code}</strong> | 🛵 Frete: R$ ${c.delivery_fee.toFixed(2)}<br>
                    📱 Dono: ${c.phone_adm} | 🔐 Senha: ${c.password_adm}
                </p>
                <div class="inventory-row-edit" style="grid-template-columns: 1fr; margin-top:10px;">
                    <button class="btn-adm-status" style="background:${isBlocked ? 'var(--success)' : 'var(--danger)'}; color:#fff; font-weight:700;" 
                        onclick="toggleCompanyBlockMaster(${c.id}, '${c.status}')">
                        ${isBlocked ? '🟢 Desbloquear e Ativar Loja' : '🔴 Bloquear Loja (Inadimplente)'}
                    </button>
                </div>
            </div>`;
    });
}

async function toggleCompanyBlockMaster(id, currentStatus) {
    if(!currentUser || currentUser.role !== 'superadmin') return;
    const nextStatus = currentStatus === 'active' ? 'blocked' : 'active';
    
    await supabaseClient.from('pods_companies').update({ status: nextStatus }).eq('id', id);
    showPremiumNotification("Escopo Modificado", `A empresa foi alterada para ${nextStatus.toUpperCase()} com sucesso.`, "success");
    renderSuperCompaniesManager();
}

async function renderSuperGlobalInventory() {
    const container = document.getElementById('super-global-inventory-container'); if(!container) return;
    container.innerHTML = '';
    
    const { data: products } = await supabaseClient.from('pods_products').select('*, pods_companies(name)');
    if(products) products.forEach(p => {
        const storeName = p.pods_companies ? p.pods_companies.name : "N/A";
        container.innerHTML += `
            <div class="inventory-card" style="border-left: 2px solid var(--border);">
                <span style="font-size:10px; color:var(--primary); font-weight:700;">🏬 LOJA: ${storeName.toUpperCase()}</span>
                <h4 style="margin-top:3px;">${p.name}</h4>
                <p style="font-size:12px; color:var(--text-muted)">Estoque Atual: <strong>${p.stock} unidades</strong> | Preço: R$ ${p.price.toFixed(2)}</p>
            </div>`;
    });
}