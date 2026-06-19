// ====================================================
// CONFIGURAÇÕES DO CLIENTE SUPABASE
// ====================================================
const SUPABASE_URL = "https://wcjzrdovqnyytveospck.supabase.co"; 
const SUPABASE_KEY = "SUA_ANON_KEY_AQUI"; // Insira sua chave anon do supabase aqui

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// VARIÁVEIS GLOBAIS
let currentUser = null; 
let globalProductsCache = []; 
let selectedFlavor = null;
let openedProductData = null;
let holdTimer = null;
let holdProgress = 0;
const HUB_STORE_WHATSAPP = "5542988141603"; 

// ====================================================
// SISTEMA DE NOTIFICAÇÕES ANIMADAS (TOAST)
// ====================================================
function showPremiumToast(title, message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? '✨' : '⚠️';
    
    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <strong>${title}</strong>
            <span>${message}</span>
        </div>
    `;
    
    container.appendChild(toast);

    // Remove o toast automaticamente após 4 segundos
    setTimeout(() => {
        toast.classList.add('fadeOut');
        setTimeout(() => toast.remove(), 400); // Espera a animação terminar
    }, 4000);
}

// ====================================================
// 1. LÓGICA DE LOGIN E CADASTRO (AUTH)
// ====================================================
function toggleAuthMode(mode) {
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');
    const subtitle = document.getElementById('auth-subtitle');

    if (mode === 'register') {
        formLogin.style.display = 'none';
        formRegister.style.display = 'block';
        subtitle.innerText = "Crie sua conta para pedir";
    } else {
        formRegister.style.display = 'none';
        formLogin.style.display = 'block';
        subtitle.innerText = "Acesso Exclusivo";
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const password = document.getElementById('reg-password').value.trim();

    try {
        const { error } = await supabaseClient.from('pods_users').insert([{
            name: name, phone: phone, password: password, company_id: 1 
        }]);

        if (error) throw error;

        showPremiumToast("Bem-vindo(a)!", "Conta criada com sucesso. Faça seu login.", "success");
        toggleAuthMode('login'); 
        document.getElementById('login-phone').value = phone; 
        document.getElementById('login-code').value = ''; 

    } catch (err) {
        console.error(err);
        showPremiumToast("Ops!", "Este telefone já pode estar cadastrado.", "error");
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const phone = document.getElementById('login-phone').value.trim();
    const code = document.getElementById('login-code').value.trim();

    // Admin
    if (phone === "404" && code === "Robi2103") {
        currentUser = { phone: "Admin", name: "Admin", role: "admin" };
        document.getElementById('admin-btn-header').style.display = 'inline-block';
        showStorefront();
        showPremiumToast("Acesso Liberado", "Bem-vindo ao painel de controle.", "success");
        return;
    } 

    // Convidado
    if (code.toUpperCase() === "HUB") {
        currentUser = { phone: phone, name: "Convidado", role: "customer" };
        document.getElementById('admin-btn-header').style.display = 'none';
        showStorefront();
        showPremiumToast("Sucesso", "Bem-vindo à Hub Store!", "success");
        return;
    }

    // Usuário DB
    try {
        const { data, error } = await supabaseClient
            .from('pods_users')
            .select('*')
            .eq('phone', phone)
            .eq('password', code)
            .single();

        if (data) {
            currentUser = { phone: data.phone, name: data.name, role: "customer" };
            document.getElementById('admin-btn-header').style.display = 'none';
            showStorefront();
            showPremiumToast("Sucesso", `Que bom te ver novamente, ${data.name}!`, "success");
        } else {
            showPremiumToast("Acesso Negado", "Telefone ou senha incorretos.", "error");
        }
    } catch (err) {
        showPremiumToast("Erro de Conexão", "Não foi possível validar o usuário.", "error");
    }
}

function logout() {
    currentUser = null;
    document.getElementById('login-phone').value = ''; document.getElementById('login-code').value = '';
    document.getElementById('reg-name').value = ''; document.getElementById('reg-phone').value = ''; document.getElementById('reg-password').value = '';
    
    toggleAuthMode('login');
    switchScreen('login-screen');
    showPremiumToast("Até logo!", "Você saiu da conta.", "success");
}

// ====================================================
// 2. NAVEGAÇÃO E MODAIS ANIMADOS
// ====================================================
function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active-screen'));
    document.getElementById(screenId).classList.add('active-screen');
}

function showStorefront() { switchScreen('store-screen'); loadHubProducts(); }
function showAdminPanel() { switchScreen('admin-screen'); loadHubProducts(); }

// Controladores de Modal com Classe Active
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        if (modalId === 'buy-modal') resetHoldButton();
    }
}

function setupRealtimeUpdates() {
    if (!supabaseClient) return;
    supabaseClient.channel('public:pods_products')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pods_products' }, payload => {
            loadHubProducts(); 
        }).subscribe();
}

// ====================================================
// 3. CARREGAMENTO DA VITRINE
// ====================================================
async function loadHubProducts() {
    if (!supabaseClient) return;
    try {
        const { data: products, error } = await supabaseClient.from('pods_products').select('*').order('name', { ascending: true });
        if (error) throw error;
        globalProductsCache = products || [];

        if (document.getElementById('store-screen').classList.contains('active-screen')) renderProductsVitrine();
        else if (document.getElementById('admin-screen').classList.contains('active-screen')) { renderAdminPanel(); renderProductsVitrine(); }
    } catch (err) { console.error(err); }
}

function renderProductsVitrine() {
    const grid = document.getElementById('products-grid');
    if (!grid) return;
    grid.innerHTML = '';

    globalProductsCache.forEach(p => {
        const hasStock = p.stock > 0;
        const imageUrl = p.image_url || 'https://via.placeholder.com/300x200/111/00DFD8?text=Sem+Foto';

        grid.innerHTML += `
            <div class="product-card">
                <img src="${imageUrl}" class="product-image" alt="${p.name}">
                <div>
                    <h3 style="margin: 0 0 5px 0;">${p.name}</h3>
                    <p style="font-size: 13px; color: var(--text-muted); margin: 0 0 10px 0;">Estoque: ${p.stock} un</p>
                    <span style="font-size: 20px; color: var(--primary); font-weight: 900; display: block; margin-bottom: 15px;">R$ ${parseFloat(p.price).toFixed(2)}</span>
                </div>
                <button type="button" class="btn-primary" 
                    style="background: ${hasStock ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}; color: ${hasStock ? '#000' : '#666'};"
                    ${hasStock ? `onclick='openBuyModalData(${JSON.stringify(p)})'` : 'disabled'}>
                    ${hasStock ? '🛍️ Solicitar Dispositivo' : '❌ Esgotado'}
                </button>
            </div>
        `;
    });
}

// ====================================================
// 4. PAINEL DE ADMINISTRAÇÃO E ESTOQUE
// ====================================================
function renderAdminPanel() {
    const list = document.getElementById('admin-stock-list');
    list.innerHTML = '';

    globalProductsCache.forEach(p => {
        let flavorsHtml = '';
        const flavorsObj = p.flavors || {};

        for (const [flavorName, qty] of Object.entries(flavorsObj)) {
            flavorsHtml += `
                <div class="admin-flavor-row">
                    <span style="font-size: 14px; font-weight: bold; color: var(--text-muted);">${flavorName}</span>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="number" id="qty-${p.id}-${flavorName.replace(/\s+/g, '')}" class="stock-input" value="${qty}" min="0">
                        <button onclick="updateFlavorStock('${p.id}', '${flavorName}')" style="background: var(--primary); color:#000; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px; transition: 0.2s;">Atualizar</button>
                    </div>
                </div>
            `;
        }

        list.innerHTML += `
            <div style="margin-bottom: 25px; border-bottom: 1px solid var(--border); padding-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h4 style="color: #fff; margin: 0; font-size: 18px;">${p.name} <span style="color:var(--primary); font-size:14px; background: rgba(0, 223, 216, 0.1); padding: 2px 8px; border-radius: 10px; margin-left: 5px;">Total: ${p.stock}</span></h4>
                    <button class="btn-outline" style="font-size: 12px; padding: 6px 12px;" onclick="promptAddFlavor('${p.id}')">+ Sabor</button>
                </div>
                ${flavorsHtml}
            </div>
        `;
    });
}

async function handleAddNewProduct(e) {
    e.preventDefault();
    const name = document.getElementById('new-prod-name').value;
    const price = parseFloat(document.getElementById('new-prod-price').value);
    const puffs = document.getElementById('new-prod-puffs').value || "N/A";
    const image_url = document.getElementById('new-prod-image').value;

    try {
        const { error } = await supabaseClient.from('pods_products').insert([{ name, price, puffs, image_url, flavors: {}, stock: 0 }]);
        if (error) throw error;
        
        closeModal('add-product-modal');
        loadHubProducts();
        showPremiumToast("Modelo Adicionado", "Use o botão '+ Sabor' para definir o estoque.", "success");
    } catch (err) { showPremiumToast("Erro", "Falha ao adicionar produto.", "error"); }
}

async function promptAddFlavor(productId) {
    const flavorName = prompt("Qual o nome do NOVO SABOR que deseja adicionar?");
    if (!flavorName || flavorName.trim() === "") return;

    const p = globalProductsCache.find(x => x.id === productId);
    if (!p) return;
    if (p.flavors && p.flavors[flavorName] !== undefined) { showPremiumToast("Ops!", "Este sabor já existe.", "error"); return; }

    const newFlavors = { ...p.flavors, [flavorName]: 0 };
    try {
        const { error } = await supabaseClient.from('pods_products').update({ flavors: newFlavors }).eq('id', productId);
        if (error) throw error;
        showPremiumToast("Sabor Criado", `${flavorName} adicionado. Atualize a quantidade.`, "success");
    } catch (err) { showPremiumToast("Erro", "Falha ao criar sabor.", "error"); }
}

async function updateFlavorStock(productId, flavorName) {
    const inputId = `qty-${productId}-${flavorName.replace(/\s+/g, '')}`;
    const newQty = parseInt(document.getElementById(inputId).value);
    if (isNaN(newQty)) return;

    const p = globalProductsCache.find(x => x.id === productId);
    if (!p) return;

    p.flavors[flavorName] = newQty;
    p.stock = Object.values(p.flavors).reduce((acc, val) => acc + parseInt(val), 0);

    try {
        const { error } = await supabaseClient.from('pods_products').update({ flavors: p.flavors, stock: p.stock }).eq('id', productId);
        if (error) throw error;
        showPremiumToast("Estoque Atualizado", `${flavorName} agora possui ${newQty} unidades.`, "success");
    } catch (err) { showPremiumToast("Erro", "Falha ao atualizar estoque.", "error"); }
}

// ====================================================
// 5. CHECKOUT E COMPRA
// ====================================================
function openBuyModalData(product) {
    selectedFlavor = null; openedProductData = product; resetHoldButton();
    const container = document.getElementById('flavor-buttons-container');
    container.innerHTML = '';
    
    for (const [fName, fStock] of Object.entries(product.flavors || {})) {
        const isAvail = parseInt(fStock) > 0;
        container.innerHTML += `<button type="button" class="flavor-btn" ${isAvail ? '' : 'disabled style="opacity:0.3;cursor:not-allowed;"'} onclick="selectFlavorBtn(this, '${fName}')">${fName} ${isAvail ? `(${fStock})` : '❌'}</button>`;
    }

    document.getElementById('summary-prod-price').innerText = `R$ ${parseFloat(product.price).toFixed(2)}`;
    document.getElementById('summary-total-price').innerText = `R$ ${parseFloat(product.price).toFixed(2)}`;
    openModal('buy-modal');
}

function selectFlavorBtn(el, name) {
    document.querySelectorAll('.flavor-btn').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected'); selectedFlavor = name;
}
function toggleTrocoField() {
    const m = document.getElementById('buy-payment-method').value;
    const c = document.getElementById('troco-container');
    if (m === 'Dinheiro') c.style.display = 'block';
    else { c.style.display = 'none'; document.getElementById('buy-change-needed').value = 'Não'; document.getElementById('buy-change-value').style.display = 'none'; }
}
function toggleTrocoValorField() {
    const n = document.getElementById('buy-change-needed').value;
    const i = document.getElementById('buy-change-value');
    if (n === 'Sim') { i.style.display = 'block'; i.required = true; } else { i.style.display = 'none'; i.required = false; }
}

// ====================================================
// 6. BOTÃO SEGURAR & WHATSAPP
// ====================================================
function initHoldBtn() {
    const btn = document.getElementById('btn-hold-trigger');
    if (!btn) return;
    const start = (e) => {
        e.preventDefault(); if (holdTimer) return;
        holdTimer = setInterval(() => {
            holdProgress += 5; if (holdProgress > 100) holdProgress = 100;
            document.getElementById('hold-progress-fill').style.width = `${holdProgress}%`;
            if (holdProgress === 100) { clearInterval(holdTimer); holdTimer = null; finalizarPedidoCliente(openedProductData); }
        }, 100);
    };
    const stop = () => { if (holdProgress < 100) { clearInterval(holdTimer); holdTimer = null; resetHoldButton(); } };
    btn.addEventListener('mousedown', start); btn.addEventListener('touchstart', start);
    btn.addEventListener('mouseup', stop); btn.addEventListener('mouseleave', stop); btn.addEventListener('touchend', stop);
}

function resetHoldButton() { holdProgress = 0; const f = document.getElementById('hold-progress-fill'); if(f) f.style.width = '0%'; }

async function finalizarPedidoCliente(product) {
    const pay = document.getElementById('buy-payment-method').value;
    const chN = document.getElementById('buy-change-needed').value;
    const chV = document.getElementById('buy-change-value').value;
    const addr = document.getElementById('client-address').value;
    const phone = currentUser ? currentUser.phone : "Não informado";
    const clientName = currentUser ? currentUser.name : "Cliente Hub";

    if (!selectedFlavor || !addr || !pay) { showPremiumToast("Atenção", "Preencha o endereço, pagamento e escolha um sabor!", "error"); resetHoldButton(); return; }
    
    let trocoText = "Não precisa";
    if (pay === 'Dinheiro' && chN === 'Sim') trocoText = `Troco para R$ ${parseFloat(chV).toFixed(2)}`;

    try {
        const orderId = `HUB-${Math.floor(100000 + Math.random()*900000)}`;
        const { error } = await supabaseClient.from('pods_orders').insert([{
            order_number: orderId, product_name: product.name, flavor_selected: selectedFlavor,
            price: product.price, payment_method: pay, change_needed: trocoText, address: addr, phone: phone, status: 'Pendente'
        }]);

        if (error) throw error;
        const msg = `💨 *NOVO PEDIDO - HUB STORE* 💨\n\n📌 *Ordem:* ${orderId}\n👤 *Cliente:* ${clientName}\n📍 *Endereço:* ${addr}\n📞 *Telefone:* ${phone}\n📦 *Pedido:* ${product.name}\n🎨 *Sabor:* ${selectedFlavor}\n\n💳 *Pagamento:* ${pay} (${trocoText})\n💵 *Total:* R$ ${product.price.toFixed(2)} (Entrega Grátis)`;
        
        closeModal('buy-modal');
        showPremiumToast("Pedido Confirmado!", "Redirecionando para o WhatsApp...", "success");
        setTimeout(() => { window.location.href = `https://api.whatsapp.com/send?phone=${HUB_STORE_WHATSAPP}&text=${encodeURIComponent(msg)}`; }, 1500);
    } catch (err) { showPremiumToast("Erro Crítico", "Falha ao fechar pedido.", "error"); resetHoldButton(); }
}

// INICIALIZAÇÃO
window.addEventListener('DOMContentLoaded', () => {
    initHoldBtn();
    setupRealtimeUpdates(); 
});