// ====================================================
// CONFIGURAÇÕES DO CLIENTE SUPABASE
// ====================================================
const SUPABASE_URL = "https://wcjzrdovqnyytveospck.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjanpyZG92cW55eXR2ZW9zcGNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExOTExNDcsImV4cCI6MjA5Njc2NzE0N30.cSXeFxYnD24yNP-zIlhIONLsHx-oVDRg8OI9aSEL7oY";

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// VARIÁVEIS GLOBAIS E ESTADO
let currentUser = null; 
let globalProductsCache = []; 
let selectedFlavor = null;
let openedProductData = null;
let holdTimer = null;
let holdProgress = 0;
const HUB_STORE_WHATSAPP = "5542988141603"; 

let myLineChart = null;
let myDoughnutChart = null;

// Inicializa Icones
document.addEventListener("DOMContentLoaded", () => {
    if(typeof lucide !== 'undefined') lucide.createIcons();
    initHoldBtn();
    setupRealtimeUpdates();
});

// ====================================================
// SISTEMA DE NOTIFICAÇÕES (TOAST) E FORMATAÇÃO
// ====================================================
function showPremiumToast(title, message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '<i data-lucide="check-circle" class="text-premium-primary"></i>' : '<i data-lucide="alert-circle" class="text-red-500"></i>';
    toast.innerHTML = `<div class="toast-icon">${icon}</div><div class="toast-content"><strong>${title}</strong><span>${message}</span></div>`;
    container.appendChild(toast);
    if(typeof lucide !== 'undefined') lucide.createIcons();
    setTimeout(() => { toast.classList.add('fadeOut'); setTimeout(() => toast.remove(), 400); }, 4000);
}

const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

// ====================================================
// 1. LÓGICA DE LOGIN E AUTH
// ====================================================
function toggleAuthMode(mode) {
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');
    const subtitle = document.getElementById('auth-subtitle');
    if (mode === 'register') {
        formLogin.style.display = 'none'; formRegister.style.display = 'block'; subtitle.innerText = "Crie sua conta para pedir";
    } else {
        formRegister.style.display = 'none'; formLogin.style.display = 'block'; subtitle.innerText = "Acesso Exclusivo";
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const password = document.getElementById('reg-password').value.trim();
    try {
        const { error } = await supabaseClient.from('pods_users').insert([{ name, phone, password, company_id: 1 }]);
        if (error) throw error;
        showPremiumToast("Bem-vindo(a)!", "Conta criada com sucesso. Faça seu login.", "success");
        toggleAuthMode('login'); document.getElementById('login-phone').value = phone; document.getElementById('login-code').value = ''; 
    } catch (err) { showPremiumToast("Ops!", "Este telefone já pode estar cadastrado.", "error"); }
}

async function handleLogin(e) {
    e.preventDefault();
    const phone = document.getElementById('login-phone').value.trim();
    const code = document.getElementById('login-code').value.trim();

    // Admin Access
    if (phone === "404" && code === "Robi2103") {
        currentUser = { phone: "Admin", name: "Admin", role: "admin" };
        document.getElementById('login-screen').classList.remove('active-screen');
        document.getElementById('login-screen').style.display = 'none';
        
        document.getElementById('app-layout').classList.remove('hidden');
        document.getElementById('admin-sidebar').classList.remove('hidden'); // Mostra Menu Lateral
        document.getElementById('admin-sidebar').classList.add('flex');
        document.getElementById('client-logout-btn').classList.add('hidden'); // Oculta botão de sair da navbar publica
        
        navigate('dashboard');
        showPremiumToast("Acesso Liberado", "Bem-vindo ao Painel Hub.", "success");
        return;
    } 

    // General Customer Access (DB or Generic 'HUB' code)
    try {
        let isCustomer = false;
        let customerName = "Convidado";

        if (code.toUpperCase() === "HUB") {
            isCustomer = true;
        } else {
            const { data, error } = await supabaseClient.from('pods_users').select('*').eq('phone', phone).eq('password', code).single();
            if (data) { isCustomer = true; customerName = data.name; }
        }

        if (isCustomer) {
            currentUser = { phone: phone, name: customerName, role: "customer" };
            document.getElementById('login-screen').classList.remove('active-screen');
            document.getElementById('login-screen').style.display = 'none';
            
            document.getElementById('app-layout').classList.remove('hidden');
            document.getElementById('admin-sidebar').classList.add('hidden'); // Cliente nao ve sidebar
            document.getElementById('welcome-text').innerText = `Olá, ${customerName}`;
            document.getElementById('welcome-text').classList.remove('hidden');
            
            navigate('store');
            showPremiumToast("Sucesso", "Bem-vindo à Hub Store!", "success");
        } else {
            showPremiumToast("Acesso Negado", "Credenciais incorretas.", "error");
        }
    } catch (err) { showPremiumToast("Erro", "Não foi possível validar o usuário.", "error"); }
}

function logout() {
    currentUser = null;
    document.getElementById('login-phone').value = ''; document.getElementById('login-code').value = '';
    document.getElementById('reg-name').value = ''; document.getElementById('reg-phone').value = ''; document.getElementById('reg-password').value = '';
    
    document.getElementById('app-layout').classList.add('hidden');
    document.getElementById('login-screen').style.display = 'block';
    setTimeout(() => { document.getElementById('login-screen').classList.add('active-screen'); }, 10);
    
    toggleAuthMode('login');
    showPremiumToast("Até logo!", "Você saiu da conta.", "success");
}

// ====================================================
// 2. ROTEAMENTO E NAVEGAÇÃO
// ====================================================
function navigate(route) {
    // Esconde todas as telas
    document.querySelectorAll('.screen').forEach(el => {
        el.classList.remove('active-screen');
        setTimeout(() => el.style.display = 'none', 300); // Aguarda transição
    });

    // Reset Menu Colors
    document.querySelectorAll('#sidebar-menu button').forEach(el => {
        el.classList.remove('bg-zinc-800/50', 'text-premium-primary');
        el.classList.add('text-zinc-400');
    });

    // Mostra nova tela
    setTimeout(() => {
        const viewTarget = document.getElementById(`view-${route}`);
        if (viewTarget) {
            viewTarget.style.display = 'block';
            setTimeout(() => viewTarget.classList.add('active-screen'), 10);
        }
    }, 300);

    // Atualiza Menu Cor
    const activeBtn = document.getElementById(`btn-nav-${route}`);
    if (activeBtn) {
        activeBtn.classList.remove('text-zinc-400');
        activeBtn.classList.add('bg-zinc-800/50', 'text-premium-primary');
    }

    // Carrega Dados da Tela Ativa
    if (route === 'store' || route === 'admin') loadHubProducts();
    if (route === 'dashboard') loadDashboardData();
    if (route === 'cashflow') fetchTransactions();
    if (route === 'bills') fetchBills();
}

function openModal(modalId) { const m = document.getElementById(modalId); if(m) m.classList.add('active'); }
function closeModal(modalId) { const m = document.getElementById(modalId); if(m) m.classList.remove('active'); resetHoldButton(); }

// ====================================================
// 3. REALTIME SUPABASE
// ====================================================
function setupRealtimeUpdates() {
    if (!supabaseClient) return;
    supabaseClient.channel('realtime-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pods_products' }, () => { loadHubProducts(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => { loadDashboardData(); fetchTransactions(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, () => { fetchBills(); })
        .subscribe();
}

// ====================================================
// 4. VITRINE E GESTÃO DE ESTOQUE
// ====================================================
async function loadHubProducts() {
    if (!supabaseClient) return;
    const { data: products, error } = await supabaseClient.from('pods_products').select('*').order('name', { ascending: true });
    if (error) return;
    globalProductsCache = products || [];

    // Renderiza nos dois lugares se estiverem visíveis/acessados
    renderProductsVitrine();
    if(currentUser && currentUser.role === 'admin') renderAdminPanel();
}

function renderProductsVitrine() {
    const grid = document.getElementById('products-grid');
    if (!grid) return;
    grid.innerHTML = '';
    globalProductsCache.forEach(p => {
        const hasStock = p.stock > 0;
        const imageUrl = p.image || 'https://via.placeholder.com/300x200/111/00DFD8?text=Sem+Foto';
        grid.innerHTML += `
            <div class="product-card">
                <img src="${imageUrl}" class="product-image" alt="${p.name}">
                <div>
                    <h3 class="font-bold text-lg mb-1">${p.name}</h3>
                    <p class="text-sm text-zinc-400 mb-3">Estoque: ${p.stock} un</p>
                    <span class="text-2xl text-premium-primary font-black block mb-4">R$ ${parseFloat(p.price).toFixed(2)}</span>
                </div>
                <button type="button" class="w-full font-bold py-3 px-4 rounded-lg transition-all ${hasStock ? 'bg-premium-primary text-black hover:shadow-[0_0_15px_rgba(0,223,216,0.3)] hover:-translate-y-1' : 'bg-white/5 text-zinc-500 cursor-not-allowed'}" 
                    ${hasStock ? `onclick='openBuyModalData(${JSON.stringify(p)})'` : 'disabled'}>
                    ${hasStock ? '<span class="flex items-center justify-center gap-2"><i data-lucide="shopping-bag" class="w-5 h-5"></i> Pedir Agora</span>' : 'Esgotado'}
                </button>
            </div>
        `;
    });
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

function renderAdminPanel() {
    const list = document.getElementById('admin-stock-list');
    if(!list) return;
    list.innerHTML = '';
    globalProductsCache.forEach(p => {
        let flavorsHtml = '';
        for (const [flavorName, qty] of Object.entries(p.flavors || {})) {
            flavorsHtml += `
                <div class="flex justify-between items-center bg-black/40 p-3 rounded-lg mb-2 border border-zinc-800/50">
                    <span class="text-sm text-zinc-300">${flavorName}</span>
                    <div class="flex gap-2 items-center">
                        <input type="number" id="qty-${p.id}-${flavorName.replace(/\s+/g, '')}" class="w-16 bg-zinc-900 border border-zinc-700 text-center rounded p-1 text-sm text-white" value="${qty}" min="0">
                        <button onclick="updateFlavorStock('${p.id}', '${flavorName}')" class="bg-premium-primary text-black text-xs font-bold px-3 py-1.5 rounded hover:bg-premium-primaryHover transition">Salvar</button>
                    </div>
                </div>`;
        }
        list.innerHTML += `
            <div class="border border-zinc-800 rounded-xl p-4 bg-zinc-900/20">
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <h4 class="text-white font-bold text-lg">${p.name}</h4>
                        <p class="text-xs text-zinc-500">Custo Ref: R$ ${parseFloat(p.cost_price || 0).toFixed(2)} | Venda: R$ ${parseFloat(p.price).toFixed(2)}</p>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="bg-premium-primary/10 text-premium-primary text-sm px-3 py-1 rounded-full font-bold border border-premium-primary/20">${p.stock} un</span>
                        <button class="text-xs bg-zinc-800 text-white px-3 py-1.5 rounded-lg hover:bg-zinc-700 transition" onclick="promptAddFlavor('${p.id}')">+ Sabor</button>
                    </div>
                </div>
                ${flavorsHtml}
            </div>`;
    });
}

async function handleAddNewProduct(e) {
    e.preventDefault();
    const name = document.getElementById('new-prod-name').value;
    const price = parseFloat(document.getElementById('new-prod-price').value);
    const cost_price = parseFloat(document.getElementById('new-prod-cost').value);
    const puffs = document.getElementById('new-prod-puffs').value || "N/A";
    const image = document.getElementById('new-prod-image').value;

    try {
        const { error } = await supabaseClient.from('pods_products').insert([{ name, price, cost_price, puffs, image, flavors: {}, stock: 0 }]);
        if (error) throw error;
        closeModal('add-product-modal'); loadHubProducts(); showPremiumToast("Modelo Adicionado", "Produto salvo no banco.", "success");
    } catch (err) { showPremiumToast("Erro", "Falha ao adicionar.", "error"); }
}

async function promptAddFlavor(productId) {
    const flavorName = prompt("Nome do NOVO SABOR:");
    if (!flavorName || flavorName.trim() === "") return;
    const p = globalProductsCache.find(x => x.id === productId);
    if (!p) return;
    if (p.flavors && p.flavors[flavorName] !== undefined) { showPremiumToast("Ops!", "Sabor já existe.", "error"); return; }
    
    const newFlavors = { ...p.flavors, [flavorName]: 0 };
    try {
        await supabaseClient.from('pods_products').update({ flavors: newFlavors }).eq('id', productId);
        showPremiumToast("Sabor Criado", "Sabor adicionado.", "success");
    } catch (err) { showPremiumToast("Erro", "Falha no banco.", "error"); }
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
        await supabaseClient.from('pods_products').update({ flavors: p.flavors, stock: p.stock }).eq('id', productId);
        showPremiumToast("Estoque Atualizado", "Quantidade salva.", "success");
    } catch (err) { showPremiumToast("Erro", "Falha ao atualizar.", "error"); }
}

// ====================================================
// 5. COMPRA E INTEGRAÇÃO FINANCEIRA
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
function selectFlavorBtn(el, name) { document.querySelectorAll('.flavor-btn').forEach(b => b.classList.remove('selected')); el.classList.add('selected'); selectedFlavor = name; }
function toggleTrocoField() {
    const m = document.getElementById('buy-payment-method').value; const c = document.getElementById('troco-container');
    if (m === 'Dinheiro') c.style.display = 'block'; else { c.style.display = 'none'; document.getElementById('buy-change-needed').value = 'Não'; document.getElementById('buy-change-value').style.display = 'none'; }
}
function toggleTrocoValorField() {
    const n = document.getElementById('buy-change-needed').value; const i = document.getElementById('buy-change-value');
    if (n === 'Sim') { i.style.display = 'block'; i.required = true; } else { i.style.display = 'none'; i.required = false; }
}

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

    if (!selectedFlavor || !addr || !pay) { showPremiumToast("Atenção", "Preencha tudo e escolha um sabor!", "error"); resetHoldButton(); return; }
    
    let trocoText = "Não precisa";
    if (pay === 'Dinheiro' && chN === 'Sim') trocoText = `Troco para R$ ${parseFloat(chV).toFixed(2)}`;

    try {
        const orderId = `HUB-${Math.floor(100000 + Math.random()*900000)}`;
        
        // 1. REGISTRA O PEDIDO NA LOJA
        const { error: errOrder } = await supabaseClient.from('pods_orders').insert([{ 
            company_id: 1, product_name: product.name, flavor: selectedFlavor, 
            product_price: product.price, total_price: product.price, delivery_price: 0,
            payment_method: pay, change_needed: trocoText, client_address: addr, 
            client_phone: phone, client_name: clientName, status: 'Pendente' 
        }]);

        if (errOrder) throw errOrder;

        // 2. INTEGRAÇÃO FINANCEIRA AUTOMÁTICA
        await supabaseClient.from('transactions').insert([{ type: 'INCOME', amount: product.price, description: `Venda Site: ${product.name} (${selectedFlavor})`, category: 'Vendas', payment_method: pay }]);
        const custo = parseFloat(product.cost_price || 0);
        if (custo > 0) {
            await supabaseClient.from('transactions').insert([{ type: 'EXPENSE', amount: custo, description: `Custo Mercadoria: ${product.name}`, category: 'Custo Produto', payment_method: 'Interno' }]);
        }

        // 3. BAIXA NO ESTOQUE AUTOMÁTICA (A MÁGICA ACONTECE AQUI)
        const currentFlavorStock = parseInt(product.flavors[selectedFlavor]) || 0;
        const newFlavorStock = currentFlavorStock > 0 ? currentFlavorStock - 1 : 0;
        const updatedFlavors = { ...product.flavors, [selectedFlavor]: newFlavorStock };
        const newTotalStock = Object.values(updatedFlavors).reduce((acc, val) => acc + parseInt(val), 0);

        await supabaseClient.from('pods_products').update({ flavors: updatedFlavors, stock: newTotalStock }).eq('id', product.id);

        // 4. MENSAGEM DO WHATSAPP
        const msg = `💨 *NOVO PEDIDO - HUB STORE* 💨\n\n📌 *Ordem:* ${orderId}\n👤 *Cliente:* ${clientName}\n📍 *Endereço:* ${addr}\n📞 *Telefone:* ${phone}\n📦 *Pedido:* ${product.name}\n🎨 *Sabor:* ${selectedFlavor}\n\n💳 *Pagamento:* ${pay} (${trocoText})\n💵 *Total:* R$ ${parseFloat(product.price).toFixed(2)}`;
        
        closeModal('buy-modal');
        showPremiumToast("Pedido Confirmado!", "Tudo certo! Redirecionando...", "success");
        setTimeout(() => { window.location.href = `https://api.whatsapp.com/send?phone=${HUB_STORE_WHATSAPP}&text=${encodeURIComponent(msg)}`; }, 1500);
    } catch (err) { 
        console.error("Erro na função finalizar pedido:", err);
        showPremiumToast("Erro", "Falha ao processar pedido.", "error"); 
        resetHoldButton(); 
    }
}
// ====================================================
// 6. DASHBOARD E FLUXO DE CAIXA
// ====================================================
async function loadDashboardData() {
    const { data, error } = await supabaseClient.from('transactions').select('*');
    if (error) return;

    let totalIn = 0, totalOut = 0;
    const expenseCats = {};
    const lineIn = Array(7).fill(0), lineOut = Array(7).fill(0);
    
    const last7Days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}); }).reverse();

    data.forEach(t => {
        if(t.type === 'INCOME') totalIn += Number(t.amount);
        if(t.type === 'EXPENSE') totalOut += Number(t.amount);
        if(t.type === 'EXPENSE') expenseCats[t.category] = (expenseCats[t.category] || 0) + Number(t.amount);

        const d = new Date(t.created_at); const dStr = d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'});
        const idx = last7Days.indexOf(dStr);
        if (idx !== -1) { if(t.type === 'INCOME') lineIn[idx] += Number(t.amount); if(t.type === 'EXPENSE') lineOut[idx] += Number(t.amount); }
    });

    document.getElementById('card-income').innerText = formatCurrency(totalIn);
    document.getElementById('card-expense').innerText = formatCurrency(totalOut);
    const saldo = totalIn - totalOut;
    document.getElementById('card-balance').innerText = formatCurrency(saldo);
    document.getElementById('card-balance').style.color = saldo < 0 ? '#ef4444' : '#fff'; 

    renderCharts(last7Days, lineIn, lineOut, Object.keys(expenseCats), Object.values(expenseCats));
}

function renderCharts(labelsLine, dataIn, dataOut, labelsDoughnut, dataDoughnut) {
    Chart.defaults.color = '#a1a1aa';
    if (!labelsDoughnut.length) { labelsDoughnut = ['Sem Despesas']; dataDoughnut = [0.01]; }

    const ctxL = document.getElementById('lineChart');
    if(ctxL) {
        if(myLineChart) myLineChart.destroy();
        myLineChart = new Chart(ctxL.getContext('2d'), {
            type: 'line', data: { labels: labelsLine, datasets: [ { label: 'Entradas', data: dataIn, borderColor: '#00DFD8', backgroundColor: 'rgba(0, 223, 216, 0.1)', tension: 0.4, fill: true }, { label: 'Saídas', data: dataOut, borderColor: '#ef4444', backgroundColor: 'transparent', tension: 0.4 } ] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false } } } }
        });
    }

    const ctxD = document.getElementById('doughnutChart');
    if(ctxD) {
        if(myDoughnutChart) myDoughnutChart.destroy();
        myDoughnutChart = new Chart(ctxD.getContext('2d'), {
            type: 'doughnut', data: { labels: labelsDoughnut, datasets: [{ data: dataDoughnut, backgroundColor: ['#00DFD8', '#3f3f46', '#71717a', '#a1a1aa', '#ef4444'], borderColor: '#09090b', borderWidth: 2 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { position: 'bottom', labels: { padding: 20, usePointStyle: true } } } }
        });
    }
}

// LANCAMENTO FLUXO CAIXA MANUAL
document.getElementById('form-transaction').addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('trans-type').value; const amount = parseFloat(document.getElementById('trans-value').value);
    const description = document.getElementById('trans-desc').value; const category = document.getElementById('trans-category').value;
    
    const { error } = await supabaseClient.from('transactions').insert([{ type, amount, description, category, payment_method: 'Manual' }]);
    if (error) showPremiumToast('Erro', 'Falha ao salvar transação.', 'error'); else { e.target.reset(); showPremiumToast('Sucesso', 'Transação registrada.'); }
});

async function fetchTransactions() {
    const { data, error } = await supabaseClient.from('transactions').select('*').order('created_at', { ascending: false }).limit(30);
    const tbody = document.getElementById('history-table-body');
    if (!tbody || error) return;
    if (!data || !data.length) { tbody.innerHTML = '<tr><td colSpan="4" class="p-4 text-center text-zinc-500">Nenhum registro encontrado.</td></tr>'; return; }
    
    tbody.innerHTML = data.map(t => {
        const isInc = t.type === 'INCOME';
        const dStr = new Date(t.created_at).toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
        return `<tr class="border-b border-zinc-800/50 hover:bg-zinc-800/20"><td class="p-4 font-medium text-white">${t.description}</td><td class="p-4 text-zinc-400">${t.category}</td><td class="p-4 text-zinc-500 text-xs">${dStr}</td><td class="p-4 text-right font-bold ${isInc?'text-green-400':'text-red-400'}">${isInc?'+':'-'} ${formatCurrency(t.amount)}</td></tr>`;
    }).join('');
}

// ====================================================
// 7. CONTAS A PAGAR
// ====================================================
document.getElementById('form-bill').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('bill-title').value; const due_date = document.getElementById('bill-date').value; const amount = parseFloat(document.getElementById('bill-value').value);
    const { error } = await supabaseClient.from('bills').insert([{ title, due_date, amount, status: 'PENDING' }]);
    if (error) showPremiumToast('Erro', 'Falha ao salvar conta.', 'error'); else { e.target.reset(); showPremiumToast('Sucesso', 'Conta agendada!'); }
});

async function fetchBills() {
    const { data, error } = await supabaseClient.from('bills').select('*').order('due_date', { ascending: true });
    const tbody = document.getElementById('bills-table-body');
    if (!tbody || error) return;
    if (!data || !data.length) { tbody.innerHTML = '<tr><td colSpan="5" class="p-4 text-center text-zinc-500">Tudo em dia! Nenhuma conta.</td></tr>'; return; }
    
    tbody.innerHTML = data.map(b => {
        const isPaid = b.status === 'PAID';
        const dStr = new Date(b.due_date + 'T00:00:00').toLocaleDateString('pt-BR');
        return `<tr class="border-b border-zinc-800/50 hover:bg-zinc-800/20 ${isPaid?'opacity-50 grayscale':''}"><td class="p-4 ${isPaid?'text-zinc-500':'text-white'}">${b.title}</td><td class="p-4 ${isPaid?'text-zinc-500':'text-red-400'}">${dStr}</td><td class="p-4 text-white">${formatCurrency(b.amount)}</td><td class="p-4"><span class="px-2 py-1 rounded-full text-xs border ${isPaid?'bg-green-500/10 text-green-500 border-green-500/20':'bg-red-500/10 text-red-500 border-red-500/20'}">${isPaid?'Paga':'Pendente'}</span></td><td class="p-4 text-center">${!isPaid?`<button onclick="markBillAsPaid('${b.id}')" class="text-zinc-400 hover:text-green-500 transition"><i data-lucide="check-circle" class="w-5 h-5 mx-auto pointer-events-none"></i></button>`:`<i data-lucide="check" class="w-5 h-5 mx-auto text-green-500/30"></i>`}</td></tr>`;
    }).join('');
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

window.markBillAsPaid = async function(id) {
    const { data: bill } = await supabaseClient.from('bills').select('*').eq('id', id).single();
    if (!bill) return;
    await supabaseClient.from('bills').update({ status: 'PAID' }).eq('id', id);
    await supabaseClient.from('transactions').insert([{ type: 'EXPENSE', amount: bill.amount, description: `Pgto Conta: ${bill.title}`, category: 'Contas', payment_method: 'Manual' }]);
    showPremiumToast('Conta Paga', 'Valor descontado do fluxo de caixa!', 'success');
}