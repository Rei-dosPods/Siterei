// CONFIGURAÇÕES DO SEU SUPABASE
const SUPABASE_URL = "https://wcjzrdovqnyytveospck.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjanpyZG92cW55eXR2ZW9zcGNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExOTExNDcsImV4cCI6MjA5Njc2NzE0N30.cSXeFxYnD24yNP-zIlhIONLsHx-oVDRg8OI9aSEL7oY";

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

let currentUser = null;
let authMode = "login";
let selectedFlavor = null;
let currentProductFile = null; 
let openedProductData = null;
let globalProductsCache = []; 
let currentCategoryFilter = "all";
const TAXA_FRETE = 10.00;

// Variável Global de Status de Expediente
let isStoreOpenGlobal = true;

// Variáveis de controle para o Hold Trigger
let holdTimer = null;
let holdProgress = 0;
const HOLD_DURATION = 1500; 

// Canal de escuta Realtime global
let realtimeChannel = null;

window.onload = function() {
    const savedUser = sessionStorage.getItem('logged_user');
    if(savedUser) {
        currentUser = JSON.parse(savedUser);
        logUserIn(currentUser);
    }
    
    const selectPromo = document.getElementById('prod-promo');
    if(selectPromo) {
        selectPromo.addEventListener('change', function(e) {
            document.getElementById('group-promo-price').style.display = e.target.value === 'sim' ? 'block' : 'none';
        });
    }

    const fileInput = document.getElementById('prod-image');
    if(fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if(file) { currentProductFile = file; }
        });
    }

    setupHoldToBuyButton();
}

function sanitizeInput(text) {
    if (typeof text !== 'string') return text;
    return text
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/\//g, "&#x2F;");
}

function showPremiumNotification(title, message, type = "success") {
    const modal = document.getElementById('notification-modal');
    const cardBox = document.getElementById('notification-card-box');
    const icon = document.getElementById('notification-icon');
    
    if(!modal || !cardBox || !icon) return;

    document.getElementById('notification-title').innerText = title;
    document.getElementById('notification-message').innerText = message;

    cardBox.className = "alert-popup animate-fade-in";

    if(type === "success") {
        cardBox.classList.add('success-alert');
        icon.innerText = "✓";
    } else {
        cardBox.classList.add('error-alert');
        icon.innerText = "✕";
    }

    modal.setAttribute("style", "display: flex !important;");
}

function closeNotificationModal() {
    const modal = document.getElementById('notification-modal');
    if(modal) modal.setAttribute("style", "display: none !important;");
}

function setAuthMode(mode) {
    authMode = mode;
    const btnLogin = document.getElementById('btn-mode-login');
    const btnRegister = document.getElementById('btn-mode-register');
    if(mode === 'login') {
        btnLogin.classList.add('active'); btnRegister.classList.remove('active');
        document.getElementById('group-auth-name').style.display = 'none';
        document.getElementById('auth-submit-btn').innerText = "Acessar Clube";
    } else {
        btnRegister.classList.add('active'); btnLogin.classList.remove('active');
        document.getElementById('group-auth-name').style.display = 'block';
        document.getElementById('auth-submit-btn').innerText = "Requisitar Conta";
    }
}

async function handleAuth(e) {
    e.preventDefault();
    const phoneInput = sanitizeInput(document.getElementById('auth-phone').value.trim());
    const passwordInput = document.getElementById('auth-password').value;

    if (phoneInput === '404' && passwordInput === '24032008') {
        currentUser = { name: "Administrador (Rei)", phone: "404", role: "admin" };
        sessionStorage.setItem('logged_user', JSON.stringify(currentUser));
        logUserIn(currentUser);
        showPremiumNotification("Acesso Real", "Bem-vindo de volta, Majestade.", "success");
        return;
    }

    if (phoneInput === '404' || phoneInput === 'Rei' || phoneInput === '123' || passwordInput === '24032008' || passwordInput === 'admin') {
        showPremiumNotification("Acesso Negado", "Credenciais administrativas inválidas.", "error");
        return;
    }

    if (authMode === 'login') {
        const { data: userFound } = await supabaseClient.from('pods_users').select('*').eq('phone', phoneInput).eq('password', passwordInput).single();
        if (userFound) {
            currentUser = { name: userFound.name, phone: userFound.phone, role: "client" };
            sessionStorage.setItem('logged_user', JSON.stringify(currentUser));
            logUserIn(currentUser);
        } else { 
            showPremiumNotification("Falha no Acesso", "O telefone digitado ou a senha estão incorretos.", "error");
        }
    } else {
        const nameInput = sanitizeInput(document.getElementById('auth-name').value.trim());
        
        if(nameInput.length < 2) {
            showPremiumNotification("Dados Inválidos", "Por favor, insira um nome válido.", "error");
            return;
        }

        const { data: existingUser } = await supabaseClient.from('pods_users').select('phone').eq('phone', phoneInput).maybeSingle();
        if (existingUser) { 
            showPremiumNotification("Aviso de Registro", "Este número de WhatsApp já possui um cadastro ativo.", "error");
            return; 
        }

        const { error } = await supabaseClient.from('pods_users').insert([{ phone: phoneInput, name: nameInput, password: passwordInput }]);
        if (!error) {
            showPremiumNotification("Ficha Deferida!", `Seja bem-vindo, ${nameInput}! Seu acesso está liberado.`, "success");
            currentUser = { name: nameInput, phone: phoneInput, role: "client" };
            sessionStorage.setItem('logged_user', JSON.stringify(currentUser));
            logUserIn(currentUser);
        } else {
            showPremiumNotification("Erro Operacional", "Não foi possível salvar os dados.", "error");
        }
    }
}

function logUserIn(user) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    document.getElementById('user-display-name').innerText = user.name;
    switchView('loja');
    fetchStoreStatusInitial(); 
    setupRealtimeListeners(); 
}

function handleLogout() {
    if (realtimeChannel) { supabaseClient.removeChannel(realtimeChannel); }
    sessionStorage.removeItem('logged_user');
    currentUser = null;
    document.getElementById('main-content').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('auth-form').reset();
    setAuthMode('login');
}

function syncStoreStatusInterface(isOpen) {
    isStoreOpenGlobal = isOpen;
    const badge = document.getElementById('store-status-badge');
    const btnToggle = document.getElementById('btn-toggle-store');

    if(badge) {
        if(isOpen) {
            badge.innerText = "Aberto";
            badge.className = "status-badge-premium aberto";
        } else {
            badge.innerText = "Fechado";
            badge.className = "status-badge-premium fechado";
        }
    }

    if(btnToggle && currentUser && currentUser.role === 'admin') {
        if(isOpen) {
            btnToggle.innerText = "Fechar Loja (Mudar para Noite)";
            btnToggle.style.background = "var(--danger)";
        } else {
            btnToggle.innerText = "Abrir Loja (Mudar para Dia)";
            btnToggle.style.background = "var(--success)";
        }
    }
}

async function fetchStoreStatusInitial() {
    const { data } = await supabaseClient.from('store_status').select('is_open').eq('id', 1).single();
    if(data) { syncStoreStatusInterface(data.is_open); }
}

async function toggleStoreStatus() {
    if(!currentUser || currentUser.role !== 'admin') return;
    const novoEstado = !isStoreOpenGlobal;
    await supabaseClient.from('store_status').update({ is_open: novoEstado }).eq('id', 1);
    showPremiumNotification("Status Alterado", `A loja agora consta como ${novoEstado ? 'ABERTA' : 'FECHADA'} para todos.`, "success");
}

function setupRealtimeListeners() {
    if (!supabaseClient) return;

    if (realtimeChannel) { supabaseClient.removeChannel(realtimeChannel); }

    realtimeChannel = supabaseClient.channel('custom-all-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pods_orders' }, (payload) => {
        const activeSection = document.querySelector('.view-section.active');
        if (!activeSection) return;

        if (activeSection.id === 'view-admin' && currentUser.role === 'admin') {
            renderAdminOrders(); 
        } else if (activeSection.id === 'view-historico' && currentUser.role === 'client') {
            renderClientHistory(); 
        } else if (activeSection.id === 'view-clientes' && currentUser.role === 'admin') {
            renderAdminClientsManager();
        }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pods_products' }, (payload) => {
        fetchAndRenderStore(); 
        if (currentUser.role === 'admin' && document.querySelector('#view-gerenciar.active')) {
            renderAdminInventoryManager();
        }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'store_status' }, (payload) => {
        syncStoreStatusInterface(payload.new.is_open);
    })
    .subscribe();
}

// 🛠️ FUNÇÃO TOTALMENTE CORRIGIDA SEM O UNDERLINE QUE FAZIA A TELA TRAVAR
function switchView(view) {
    if((view === 'admin' || view === 'gerenciar' || view === 'clientes') && (!currentUser || currentUser.role !== 'admin')) {
        handleLogout();
        showPremiumNotification("Violação de Escopo", "Tentativa de quebra de privilégios detectada.", "error");
        return;
    }

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    
    const adminNav = document.getElementById('admin-nav-tabs');
    const clientNav = document.getElementById('client-nav-tabs');

    if(currentUser.role === 'admin') {
        adminNav.style.display = 'flex'; clientNav.style.display = 'none';
        if(view === 'loja') {
            const btnLojaAdm = document.getElementById('tab-adm-loja-btn');
            if(btnLojaAdm) btnLojaAdm.classList.add('active');
        }
    } else {
        adminNav.style.display = 'none'; clientNav.style.display = 'flex';
        if(view === 'loja') {
            const btnLojaCli = document.getElementById('tab-loja-btn');
            if(btnLojaCli) btnLojaCli.classList.add('active');
        }
    }

    if(view === 'loja') { document.getElementById('view-loja').classList.add('active'); fetchAndRenderStore(); }
    else if (view === 'historico') { const btnHist = document.getElementById('tab-historico-btn'); if(btnHist) btnHist.classList.add('active'); document.getElementById('view-historico').classList.add('active'); renderClientHistory(); }
    else if (view === 'admin') { const btnAdm = document.getElementById('tab-admin-btn'); if(btnAdm) btnAdm.classList.add('active'); document.getElementById('view-admin').classList.add('active'); renderAdminOrders(); syncStoreStatusInterface(isStoreOpenGlobal); }
    else if (view === 'gerenciar') { const btnGer = document.getElementById('tab-gerenciar-btn'); if(btnGer) btnGer.classList.add('active'); document.getElementById('view-gerenciar').classList.add('active'); renderAdminInventoryManager(); }
    else if (view === 'clientes') { const btnCli = document.getElementById('tab-clientes-btn'); if(btnCli) btnCli.classList.add('active'); document.getElementById('view-clientes').classList.add('active'); renderAdminClientsManager(); }
}

async function fetchAndRenderStore() {
    const containerGeral = document.getElementById('products-container-client');
    if(containerGeral && containerGeral.innerHTML === '') containerGeral.innerHTML = '<p style="color:var(--text-muted)">Sincronizando vitrine...</p>';

    const { data: products } = await supabaseClient.from('pods_products').select('*').order('name', { ascending: true });
    if(!products) return;

    globalProductsCache = products; 
    filterStoreData(); 
}

function filterStoreData() {
    const query = document.getElementById('store-search-input').value.toLowerCase().trim();
    const containerGeral = document.getElementById('products-container-client');
    const containerOfertas = document.getElementById('products-container-deals');
    const dealsSection = document.getElementById('deals-section');

    if(!containerGeral) return;

    containerGeral.innerHTML = '';
    if(containerOfertas) containerOfertas.innerHTML = '';
    
    let temOferta = false;
    let visiveisGeral = 0;

    globalProductsCache.forEach(p => {
        const bateNome = p.name.toLowerCase().includes(query);
        let bateCategoria = true;
        if(currentCategoryFilter === 'low') bateCategoria = p.puffs <= 4000;
        else if (currentCategoryFilter === 'high') bateCategoria = p.puffs > 4000;

        if(bateNome && bateCategoria) {
            visiveisGeral++;
            let isAvailable = p.stock > 0;
            let stockText = p.stock >= 2 ? "Disponível" : (p.stock === 1 ? "Último!" : "Esgotado");
            let badgeClass = p.stock >= 2 ? "stock-badge available" : "stock-badge";

            const estiloImagem = p.image ? `style="background-image: url('${p.image}');"` : '';
            let htmlPreco = p.is_promo ? `<span class="old-price">R$ ${p.price}</span>R$ ${p.promo_price}` : `R$ ${p.price}`;
            let htmlPromoBadge = p.is_promo ? `<span class="promo-badge">Sale</span>` : '';

            const cardHTML = `
                <div class="product-card" onclick="openDetailsModal(${p.id})">
                    ${htmlPromoBadge}
                    <div class="product-img" ${estiloImagem}>${p.image ? '' : 'NO IMG'}</div>
                    <h3 class="product-title">${p.name}</h3>
                    <p class="product-info">💨 ${p.puffs} Puffs</p>
                    <span class="${badgeClass}">${stockText}</span>
                    <div class="price-tag" style="margin-top:10px;">${htmlPreco}</div>
                </div>`;

            containerGeral.innerHTML += cardHTML;

            if(p.is_promo && isAvailable && containerOfertas) {
                containerOfertas.innerHTML += cardHTML;
                temOferta = true;
            }
        }
    });

    if(dealsSection) dealsSection.style.display = (temOferta && query === "") ? 'block' : 'none';
    if(visiveisGeral === 0) containerGeral.innerHTML = '<p style="color:var(--text-muted); grid-column: 1/-1; text-align:center; padding:20px;">Nenhum dispositivo localizado.</p>';
}

function setCategoryFilter(category) {
    currentCategoryFilter = category;
    document.querySelectorAll('.category-pill').forEach(pill => pill.classList.remove('active'));
    
    if(category === 'all') document.getElementById('pill-cat-all').classList.add('active');
    else if(category === 'low') document.getElementById('pill-cat-low').classList.add('active');
    else if(category === 'high') document.getElementById('pill-cat-high').classList.add('active');

    filterStoreData(); 
}

async function openDetailsModal(productId) {
    const { data: product } = await supabaseClient.from('pods_products').select('*').eq('id', productId).single();
    if(!product) return;

    openedProductData = product;

    document.getElementById('details-modal-title').innerText = product.name;
    document.getElementById('details-modal-puffs').innerText = `💨 Autonomia Estimada: ${product.puffs} Puffs`;
    
    const divImg = document.getElementById('details-modal-img');
    if(product.image) divImg.style.backgroundImage = `url('${product.image}')`;
    else divImg.style.backgroundImage = 'none';

    let htmlPreco = product.is_promo ? `<span class="old-price" style="font-size:16px;">R$ ${product.price}</span> R$ ${product.promo_price}` : `R$ ${product.price}`;
    document.getElementById('details-modal-price').innerHTML = htmlPreco;

    const flavorsDiv = document.getElementById('details-modal-flavors');
    flavorsDiv.innerHTML = '';
    product.flavors.forEach(f => { flavorsDiv.innerHTML += `<button type="button" class="flavor-btn">${f}</button>`; });

    const actionBtn = document.getElementById('details-action-btn');
    if(product.stock > 0) {
        actionBtn.innerText = "Avançar para o Pedido";
        actionBtn.disabled = false;
        actionBtn.onclick = function() { closeDetailsModal(); openBuyModal(product); };
    } else {
        actionBtn.innerText = "Dispositivo Esgotado";
        actionBtn.disabled = true;
    }

    document.getElementById('details-modal').style.display = 'flex';
}

function closeDetailsModal() { document.getElementById('details-modal').style.display = 'none'; }

function openBuyModal(product) {
    currentSelectedProductId = product.id;
    selectedFlavor = null;
    resetHoldButton(); 

    const warningBox = document.getElementById('checkout-closed-warning');
    if(warningBox) { warningBox.style.display = isStoreOpenGlobal ? 'none' : 'block'; }

    const buttonsContainer = document.getElementById('flavor-buttons-container');
    buttonsContainer.innerHTML = '';
    product.flavors.forEach(f => {
        buttonsContainer.innerHTML += `<button type="button" class="flavor-btn" onclick="selectFlavorBtn(this, '${f}')">${f}</button>`;
    });

    const precoBase = product.is_promo ? Number(product.promo_price) : Number(product.price);
    document.getElementById('summary-prod-price').innerText = `R$ ${precoBase.toFixed(2)}`;
    document.getElementById('summary-total-price').innerText = `R$ ${(precoBase + TAXA_FRETE).toFixed(2)}`;
    document.getElementById('buy-modal').style.display = 'flex';
}

function selectFlavorBtn(element, flavorName) {
    document.querySelectorAll('#flavor-buttons-container .flavor-btn').forEach(btn => btn.classList.remove('selected'));
    element.classList.add('selected');
    selectedFlavor = flavorName;
}

function closeModal() { document.getElementById('buy-modal').style.display = 'none'; selectedFlavor = null; resetHoldButton(); }

function setupHoldToBuyButton() {
    const trigger = document.getElementById('btn-hold-trigger');
    if(!trigger) return;

    trigger.addEventListener('touchstart', startHolding, { passive: true });
    trigger.addEventListener('touchend', stopHolding);
    trigger.addEventListener('mousedown', startHolding);
    trigger.addEventListener('mouseup', stopHolding);
    trigger.addEventListener('mouseleave', stopHolding);
}

function startHolding(e) {
    if(!selectedFlavor) {
        alert("Por favor, selecione uma essência/sabor clicando nos botões acima.");
        stopHolding();
        return;
    }
    if(document.getElementById('client-address').value.trim() === "") return;

    const fillBar = document.getElementById('hold-progress-fill');
    const btnLabel = document.getElementById('hold-btn-label');
    
    btnLabel.innerText = "Mantendo pressionado...";
    holdProgress = 0;

    clearInterval(holdTimer);
    holdTimer = setInterval(() => {
        holdProgress += (100 / (HOLD_DURATION / 50)); 
        if (holdProgress >= 100) {
            holdProgress = 100;
            fillBar.style.width = '100%';
            clearInterval(holdTimer);
            executeOrderCheckoutProcess(); 
        } else {
            fillBar.style.width = holdProgress + '%';
        }
    }, 50);
}

function stopHolding() {
    clearInterval(holdTimer);
    if(holdProgress < 100) resetHoldButton();
}

function resetHoldButton() {
    const fillBar = document.getElementById('hold-progress-fill');
    const btnLabel = document.getElementById('hold-btn-label');
    if(fillBar) fillBar.style.width = '0%';
    if(btnLabel) btnLabel.innerText = "Segure para Confirmar Ordem";
    holdProgress = 0;
}

async function executeOrderCheckoutProcess() {
    const { data: prod } = await supabaseClient.from('pods_products').select('*').eq('id', currentSelectedProductId).single();
    if(!prod || prod.stock <= 0) { 
        showPremiumNotification("Item Esgotado", "O estoque deste pod acabou.", "error");
        closeModal(); fetchAndRenderStore(); return; 
    }

    await supabaseClient.from('pods_products').update({ stock: prod.stock - 1 }).eq('id', currentSelectedProductId);
    const address = sanitizeInput(document.getElementById('client-address').value);
    const precoFinal = prod.is_promo ? Number(prod.promo_price) : Number(prod.price);

    const statusInicialDaOrdem = isStoreOpenGlobal ? 'recebido' : 'fechado';

    await supabaseClient.from('pods_orders').insert([{
        client_name: currentUser.name, client_phone: currentUser.phone, client_address: address,
        product_name: prod.name, flavor: selectedFlavor, product_price: precoFinal,
        delivery_price: TAXA_FRETE, total_price: precoFinal + TAXA_FRETE,
        status: statusInicialDaOrdem, wait_time: ''
    }]);

    const mensagemSucesso = isStoreOpenGlobal 
        ? "Seu pedido foi faturado e já acendeu no painel mestre." 
        : "Loja Fechada! Seu pedido foi agendado e será confirmado na abertura.";

    showPremiumNotification("Ordem Sincronizada!", mensagemSucesso, "success");
    closeModal();
    fetchAndRenderStore();
}

async function renderClientHistory() {
    const container = document.getElementById('client-orders-container');
    
    const { data: activeOrders } = await supabaseClient.from('pods_orders').select('*').eq('client_phone', currentUser.phone);
    const { data: completedOrders } = await supabaseClient.from('pods_history').select('*').eq('client_phone', currentUser.phone);

    const totalOrders = [...(activeOrders || []), ...(completedOrders || [])];
    if(totalOrders.length === 0) { container.innerHTML = '<p style="color:var(--text-muted);">Sem ordens ativas ou finalizadas.</p>'; return; }
    
    container.innerHTML = '';
    totalOrders.reverse().forEach(o => {
        const isFromHistory = completedOrders ? completedOrders.some(compItem => compItem.id === o.id) : false;
        const currentStatus = isFromHistory ? 'concluido' : (o.status || 'recebido');

        let fillWidth = "0%";
        let step1Class = "", step2Class = "", step3Class = "", step4Class = "";

        let labelPasso1 = "Recebido";
        if(currentStatus === 'fechado') {
            fillWidth = "0%";
            step1Class = "active";
            labelPasso1 = "Agendado 🌙";
        } else if(currentStatus === 'recebido') { fillWidth = "0%"; step1Class = "active"; }
        else if(currentStatus === 'preparando') { fillWidth = "33%"; step1Class = "active"; step2Class = "active"; }
        else if(currentStatus === 'rota') { fillWidth = "66%"; step1Class = "active"; step2Class = "active"; step3Class = "active"; }
        else if(currentStatus === 'concluido') { fillWidth = "100%"; step1Class = "active"; step2Class = "active"; step3Class = "active"; step4Class = "active"; }

        let htmlTempoEspera = '';
        if(currentStatus !== 'concluido' && currentStatus !== 'fechado' && o.wait_time && o.wait_time.trim() !== '') {
            htmlTempoEspera = `
                <div class="wait-time-badge">
                    <span style="font-size: 13px; color: var(--text-muted);">🕒 Previsão de Entrega:</span>
                    <strong style="color: var(--success); font-size: 14px;">${o.wait_time}</strong>
                </div>`;
        } else if (currentStatus === 'fechado') {
            htmlTempoEspera = `
                <div class="wait-time-badge" style="border-color: rgba(255,159,10,0.3);">
                    <span style="font-size: 13px; color: var(--text-muted);">🌙 Aguardando Abertura:</span>
                    <strong style="color: var(--warning); font-size: 13px;">Será aceito na abertura</strong>
                </div>`;
        }

        container.innerHTML += `
            <div class="order-card" style="border-left-color: ${currentStatus === 'concluido' ? 'var(--success)' : (currentStatus === 'fechado' ? 'var(--warning)' : 'var(--primary)')}">
                <div class="order-header">
                    <strong>ORDEM #${o.id.toString().slice(-4)}</strong>
                    <span style="color: ${currentStatus === 'concluido' ? 'var(--success)' : (currentStatus === 'fechado' ? 'var(--warning)' : 'var(--primary)')}; font-size: 12px; font-weight:700;">
                        ${currentStatus.toUpperCase()}
                    </span>
                </div>
                <div class="order-body" style="margin-top: 8px;">
                    <p style="color: var(--text); font-size:14px; font-weight:500;">1x ${o.product_name} [${o.flavor}]</p>
                    <p style="font-weight:600; font-size:13px; margin: 5px 0 15px 0;">Total: R$ ${Number(o.total_price).toFixed(2)}</p>
                    
                    ${htmlTempoEspera}

                    <div class="uber-tracker-box">
                        <div class="uber-timeline">
                            <div class="uber-timeline-fill" style="width: ${fillWidth}"></div>
                            
                            <div class="uber-step ${step1Class}">
                                <div class="uber-dot">1</div>
                                <div class="uber-step-label">${labelPasso1}</div>
                            </div>
                            <div class="uber-step ${step2Class}">
                                <div class="uber-dot">2</div>
                                <div class="uber-step-label">Preparando</div>
                            </div>
                            <div class="uber-step ${step3Class}">
                                <div class="uber-dot">3</div>
                                <div class="uber-step-label">Em Rota</div>
                            </div>
                            <div class="uber-step ${step4Class}">
                                <div class="uber-dot">4</div>
                                <div class="uber-step-label">Entregue</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    });
}

async function renderAdminOrders() {
    if(!currentUser || currentUser.role !== 'admin') return;

    const container = document.getElementById('orders-container');
    const { data: orders } = await supabaseClient.from('pods_orders').select('*').order('id', { ascending: false });

    if(!orders || orders.length === 0) { container.innerHTML = '<p style="color:var(--text-muted)">Sem ordens de envio ativas no momento.</p>'; return; }
    container.innerHTML = '';
    orders.forEach(o => {
        const textoMensagem = `Confirmando pedido no Rei dos Pods: %0A%0A📦 *1x ${o.product_name} (${o.flavor})* %0A💵 *TOTAL:* R$ ${Number(o.total_price).toFixed(2)} %0A📍 *Endereço:* ${o.client_address}`;
        const linkWhatsapp = `https://wa.me/55${o.client_phone}?text=${textoMensagem}`;
        const statusAtual = o.status || 'recebido';

        let cardStyleExtra = '';
        let badgeNotificacaoFechado = '';
        if(statusAtual === 'fechado') {
            cardStyleExtra = 'style="border-left-color: var(--warning); background: rgba(255,159,10,0.02);"';
            badgeNotificacaoFechado = `<span style="background:var(--warning); color:#000; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:700; margin-left:10px;">🌙 FEITO COM LOJA FECHADA</span>`;
        }

        container.innerHTML += `
            <div class="order-card" id="order-card-adm-${o.id}" ${cardStyleExtra}>
                <div class="order-header"><strong>ORDEM #${o.id}</strong> ${badgeNotificacaoFechado}</div>
                <div class="order-body">
                    <p><strong>Cliente:</strong> ${o.client_name} [${o.client_phone}]</p>
                    <p><strong>Destino:</strong> ${o.client_address}</p>
                    <p style="color: var(--primary); margin: 6px 0;">Item: 1x ${o.product_name} (${o.flavor})</p>
                    <p style="font-weight:600; margin-bottom:12px;">Total Faturado: R$ ${Number(o.total_price).toFixed(2)}</p>
                    
                    <div class="adm-wait-input-group">
                        <input type="text" id="adm-wait-time-${o.id}" placeholder="Ex: 30 a 45 min" value="${o.wait_time || ''}">
                        <button class="btn-save-wait" onclick="updateOrderWaitTime(${o.id})">Fixar Tempo</button>
                    </div>

                    <div class="adm-status-row">
                        <button class="btn-adm-status ${statusAtual === 'recebido' ? 'current' : ''}" onclick="updateOrderStatus(${o.id}, 'recebido')">Aceitar/Recebido</button>
                        <button class="btn-adm-status ${statusAtual === 'preparando' ? 'current' : ''}" onclick="updateOrderStatus(${o.id}, 'preparando')">Preparar</button>
                        <button class="btn-adm-status ${statusAtual === 'rota' ? 'current' : ''}" onclick="updateOrderStatus(${o.id}, 'rota')">Em Rota</button>
                        <button class="btn-adm-status" onclick="moveOrderToFinalHistory(${o.id})">✓ Concluir</button>
                    </div>

                    <a href="${linkWhatsapp}" target="_blank" class="whatsapp-btn">💬 Chamar no WhatsApp</a>
                </div>
            </div>`;
    });
}

async function updateOrderWaitTime(orderId) {
    const inputVal = document.getElementById(`adm-wait-time-${orderId}`).value.trim();
    await supabaseClient.from('pods_orders').update({ wait_time: inputVal }).eq('id', orderId);
    showPremiumNotification("Tempo Atualizado", "Previsão de entrega enviada.", "success");
}

async function updateOrderStatus(orderId, newStatus) {
    await supabaseClient.from('pods_orders').update({ status: newStatus }).eq('id', orderId);
    showPremiumNotification("Fase Avançada", `Status da ordem alterado para: ${newStatus.toUpperCase()}`, "success");
}

async function moveOrderToFinalHistory(orderId) {
    if(!currentUser || currentUser.role !== 'admin') return;

    const { data: order } = await supabaseClient.from('pods_orders').select('*').eq('id', orderId).single();
    if(!order) return;

    const { error: insertError } = await supabaseClient.from('pods_history').insert([{
        client_name: order.client_name, client_phone: order.client_phone, client_address: order.client_address,
        product_name: order.product_name, flavor: order.flavor, product_price: order.product_price,
        delivery_price: order.delivery_price, total_price: order.total_price, status: 'concluido', wait_time: ''
    }]);

    if(!insertError) {
        await supabaseClient.from('pods_orders').delete().eq('id', orderId);
        showPremiumNotification("Entrega Finalizada", "Pedido arquivado no histórico.", "success");
    }
}

async function renderAdminInventoryManager() {
    if(!currentUser || currentUser.role !== 'admin') return;

    const container = document.getElementById('admin-inventory-container');
    container.innerHTML = '<p style="color:var(--text-muted)">Carregando nuvem...</p>';
    const { data: products } = await supabaseClient.from('pods_products').select('*').order('id', { ascending: false });
    if(!products) return;

    container.innerHTML = '';
    products.forEach(p => {
        let cardAlertClass = "";
        let alertBadgeHTML = "";

        if(p.stock === 0) {
            cardAlertClass = "stock-out";
            alertBadgeHTML = `<span class="stock-alert-label" style="background:var(--danger); color:#fff;">🚨 ESTOQUE ZERADO / REPOR</span>`;
        } else if (p.stock <= 3) {
            cardAlertClass = "stock-low";
            alertBadgeHTML = `<span class="stock-alert-label" style="background:var(--warning); color:#000;">⚠️ ESTOQUE CRÍTICO (${p.stock} UNID)</span>`;
        }

        container.innerHTML += `
            <div class="inventory-card ${cardAlertClass}">
                ${alertBadgeHTML}
                <div class="inventory-info">
                    <h4 style="color:var(--primary); font-size:16px;">${p.name}</h4>
                    <div class="inventory-row-edit">
                        <div>
                            <label>Preço Base</label>
                            <input type="number" step="0.01" id="edit-price-${p.id}" value="${p.price}">
                        </div>
                        <div>
                            <label>Promoção?</label>
                            <select id="edit-ispromo-${p.id}">
                                <option value="false" ${!p.is_promo ? 'selected' : ''}>Não</option>
                                <option value="true" ${p.is_promo ? 'selected' : ''}>Sim</option>
                            </select>
                        </div>
                        <div>
                            <label>Preço Promo</label>
                            <input type="number" step="0.01" id="edit-promoprice-${p.id}" value="${p.promo_price}">
                        </div>
                        <div>
                            <label>Estoque</label>
                            <input type="number" id="edit-stock-${p.id}" value="${p.stock}">
                        </div>
                    </div>
                    <div style="margin-top:10px;">
                        <label>Sabores (Separados por vírgula)</label>
                        <input type="text" id="edit-flavors-${p.id}" value="${p.flavors.join(', ')}" style="width:100%; padding:10px; background:var(--input-bg); border:1px solid var(--border); color:#fff; border-radius:8px; font-size:13px;">
                    </div>
                </div>
                <button class="btn-save-inline" onclick="updateProductInline(${p.id})">Salvar Mudanças</button>
                <button class="btn-action-delete" onclick="deleteProductFromInventory(${p.id})">Remover Pod</button>
            </div>`;
    });
}

async function updateProductInline(productId) {
    if(!currentUser || currentUser.role !== 'admin') return;

    const price = parseFloat(document.getElementById(`edit-price-${productId}`).value);
    const isPromo = document.getElementById(`edit-ispromo-${productId}`).value === 'true';
    const promoPrice = parseFloat(document.getElementById(`edit-promoprice-${productId}`).value) || 0;
    const stock = parseInt(document.getElementById(`edit-stock-${productId}`).value);
    const flavors = document.getElementById(`edit-flavors-${productId}`).value.split(',').map(f => f.trim()).filter(f => f !== "");

    await supabaseClient.from('pods_products').update({ price, is_promo: isPromo, promo_price: promoPrice, stock, flavors }).eq('id', productId);
    showPremiumNotification("Catálogo Atualizado", "Alterações salvas com sucesso.", "success");
}

async function deleteProductFromInventory(productId) {
    if(!currentUser || currentUser.role !== 'admin') return;

    if(confirm("Remover permanentemente?")) { 
        await supabaseClient.from('pods_products').delete().eq('id', productId); 
        showPremiumNotification("Item Excluído", "O pod foi removido do acervo público.", "success");
    }
}

async function saveProduct(e) {
    e.preventDefault();
    if(!currentUser || currentUser.role !== 'admin') return;

    const name = sanitizeInput(document.getElementById('prod-name').value);
    const puffs = parseInt(document.getElementById('prod-puffs').value);
    const price = parseFloat(document.getElementById('prod-price').value);
    const isPromoValue = document.getElementById('prod-promo').value === 'sim';
    const promoPrice = isPromoValue ? parseFloat(document.getElementById('prod-price-promo').value) : 0.00;
    const stock = parseInt(document.getElementById('prod-stock').value);
    const flavorsArray = document.getElementById('prod-flavors').value.split(',').map(f => f.trim()).filter(f => f !== "");

    let publicImageUrl = "";

    if(currentProductFile) {
        const fileExtension = currentProductFile.name.split('.').pop();
        const uniqueFileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExtension}`;

        const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('pods')
            .upload(uniqueFileName, currentProductFile);

        if(uploadError) {
            showPremiumNotification("Falha no Upload", "Erro ao subir imagem em HD para o bucket do Supabase.", "error");
            return;
        }

        const { data: publicUrlData } = supabaseClient.storage
            .from('pods')
            .getPublicUrl(uniqueFileName);
            
        if(publicUrlData) { publicImageUrl = publicUrlData.publicUrl; }
    }

    const { error } = await supabaseClient.from('pods_products').insert([{ 
        name, puffs, price, is_promo: isPromoValue, promo_price: promoPrice, 
        image: publicImageUrl, flavors: flavorsArray, stock 
    }]);

    if(!error) { 
        showPremiumNotification("Item Publicado!", "O novo pod já se encontra visível em alta definição.", "success");
        document.getElementById('product-form').reset(); 
        currentProductFile = null; 
    } else {
        showPremiumNotification("Erro Operacional", "Erro ao salvar pod na tabela relacional.", "error");
    }
}

async function renderAdminClientsManager() {
    if(!currentUser || currentUser.role !== 'admin') return;

    const container = document.getElementById('admin-clients-container');
    container.innerHTML = '<p style="color:var(--text-muted)">Buscando usuários...</p>';

    const { data: users } = await supabaseClient.from('pods_users').select('*').order('name', { ascending: true });
    const { data: activeOrders } = await supabaseClient.from('pods_orders').select('*');
    const { data: completedOrders } = await supabaseClient.from('pods_history').select('*');

    if(!users) return;

    container.innerHTML = '';
    users.forEach(u => {
        const activeFilter = activeOrders ? activeOrders.filter(o => o.client_phone === u.phone) : [];
        const completeFilter = completedOrders ? completedOrders.filter(o => o.client_phone === u.phone) : [];
        const allClientPurchases = [...activeFilter, ...completeFilter];
        let historyRowsHTML = '';
        
        if(allClientPurchases.length === 0) {
            historyRowsHTML = '<p style="color: var(--text-muted); font-size:12px; font-style:italic">Este membro ainda não realizou aquisições.</p>';
        } else {
            allClientPurchases.reverse().forEach(o => {
                const isPending = activeFilter.some(activeItem => activeItem.id === o.id);
                const tagStatus = isPending ? `<span style="color:var(--primary); font-size:10px;">[${o.status || 'Pendente'}]</span>` : '<span style="color:var(--success); font-size:10px;">[Entregue]</span>';

                historyRowsHTML += `
                    <div class="mini-order-row">
                        <span>📦 ${o.product_name} (${o.flavor}) ${tagStatus}</span>
                        <strong>R$ ${Number(o.total_price).toFixed(2)}</strong>
                    </div>`;
            });
        }

        container.innerHTML += `
            <div class="client-profile-card">
                <div class="client-profile-header">
                    <h4>${u.name}</h4>
                    <p>Whats: <strong>${u.phone}</strong></p>
                </div>
                <div class="client-purchase-history">
                    <h5>Histórico Geral de Aparelhos (${allClientPurchases.length})</h5>
                    ${historyRowsHTML}
                </div>
            </div>`;
    });
}