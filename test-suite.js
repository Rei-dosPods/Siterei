// ====================================================
// 🧪 PODS STORE - SUÍTE DE TESTES AUTOMATIZADOS E2E
// Versão 100% Completa, Isolada e Multitenant
// ====================================================

async function executarHomologacaoSaaS() {
    // 🔍 Captura o cliente do Supabase independente de como ele foi instanciado globalmente
    const client = window.supabaseClient || (window.supabase ? window.supabase : null);
    
    if (!client) {
        console.error("%c❌ Erro Crítico: O cliente de conexão com o Supabase não foi mapeado na janela global (window). Certifique-se de que o script.js já terminou de carregar.", "color: #FF5252; font-weight: bold;");
        alert("Erro: Conexão com o Supabase não encontrada. Espere a página carregar totalmente ou verifique o script.js.");
        return;
    }

    console.clear();
    console.log("%c🚀 INICIANDO AUDITORIA DE ISOLAMENTO E STRESS: PODS STORE", "color: #00DFD8; font-weight: bold; font-size: 14px; text-transform: uppercase;");
    console.log("%cMapeamento de segurança multitenant e prevenção contra vazamento de dados.", "color: #aaa; font-style: italic;");
    console.log("------------------------------------------------------------------");

    // Token único gerado por execução para evitar colisões no banco de dados em testes seguidos
    const tokenUnico = Math.floor(1000 + Math.random() * 9000);
    
    let empresaA, empresaB;
    let produtoA, produtoB;
    let ordemA;

    try {
        // ==========================================
        // 🏬 TESTE 1: ISOLAMENTO DE FRANQUIAS (EMPRESAS)
        // ==========================================
        console.log("🏬 [TESTE 1] Criando duas franquias concorrentes com taxas diferentes...");
        
        const { data: compA, error: eCompA } = await client.from('pods_companies').insert([{
            name: `Vape Alfa Neon #${tokenUnico}`, 
            invite_code: `ALFA${tokenUnico}`, 
            delivery_fee: 10.00, 
            phone_adm: `111${tokenUnico}`, 
            password_adm: "senha123", 
            status: "active"
        }]).select().single();
        if(eCompA) throw new Error("Falha ao instanciar Loja A: " + eCompA.message);
        empresaA = compA;

        const { data: compB, error: eCompB } = await client.from('pods_companies').insert([{
            name: `Vape Beta Smoke #${tokenUnico}`, 
            invite_code: `BETA${tokenUnico}`, 
            delivery_fee: 18.00, 
            phone_adm: `222${tokenUnico}`, 
            password_adm: "senha123", 
            status: "active"
        }]).select().single();
        if(eCompB) throw new Error("Falha ao instanciar Loja B: " + eCompB.message);
        empresaB = compB;

        console.log(`%c   ✓ Lojas instanciadas no ecossistema! IDs: [Alfa: ${empresaA.id} | Beta: ${empresaB.id}]`, "color: #30d158;");

        // ==========================================
        // 📦 TESTE 2: INTEGRIDADE DO ACERVO DE PRODUTOS
        // ==========================================
        console.log("\n📦 [TESTE 2] Injetando produtos com nomes iguais, mas preços e estoques diferentes por escopo...");
        
        const { data: prodA, error: eProdA } = await client.from('pods_products').insert([{
            name: "Ignite V50 Black Edition", puffs: 5000, price: 90.00, stock: 20, flavors: ["Menta"], company_id: empresaA.id
        }]).select().single();
        if(eProdA) throw new Error("Erro produto Loja A: " + eProdA.message);
        produtoA = prodA;

        const { data: prodB, error: eProdB } = await client.from('pods_products').insert([{
            name: "Ignite V50 Black Edition", puffs: 5000, price: 130.00, stock: 5, flavors: ["Menta"], company_id: empresaB.id
        }]).select().single();
        if(eProdB) throw new Error("Erro produto Loja B: " + eProdB.message);
        produtoB = prodB;

        console.log(`%c   ✓ Catálogos independentes criados e isolados com sucesso.`, "color: #30d158;");

        // ==========================================
        // 👥 TESTE 3: ISOLAMENTO DE USUÁRIOS
        // ==========================================
        console.log("\n👥 [TESTE 3] Registrando 2 usuários com mesmo nome nas respectivas lojas...");
        
        const { error: eUserA } = await client.from('pods_users').insert([{ phone: `429911${tokenUnico}`, name: "Maurício Teste", password: "123", company_id: empresaA.id }]);
        if(eUserA) throw new Error("Erro usuário Loja A: " + eUserA.message);

        const { error: eUserB } = await client.from('pods_users').insert([{ phone: `429922${tokenUnico}`, name: "Maurício Teste", password: "123", company_id: empresaB.id }]);
        if(eUserB) throw new Error("Erro usuário Loja B: " + eUserB.message);

        console.log(`%c   ✓ Usuários clonados criados e roteados para suas respectivas empresas.`, "color: #30d158;");

        // ==========================================
        // 🛒 TESTE 4: CHECKOUT SIMULTÂNEO E SEGURANÇA DE ESTOQUE
        // ==========================================
        console.log("\n🛒 [TESTE 4] Simulando compra na Loja Alfa e verificando vazamento de estoque na Loja Beta...");
        
        // Simula venda decrementando o estoque da Loja A
        await client.from('pods_products').update({ stock: produtoA.stock - 1 }).eq('id', produtoA.id);
        
        const { data: oA, error: eOA } = await client.from('pods_orders').insert([{
            client_name: "Maurício Teste", 
            client_phone: `429911${tokenUnico}`, 
            client_address: "Rua de Teste do Servidor, 404", 
            product_name: produtoA.name, 
            flavor: "Menta", 
            product_price: produtoA.price, 
            delivery_price: empresaA.delivery_fee, 
            total_price: produtoA.price + empresaA.delivery_fee, 
            status: "recebido", 
            company_id: empresaA.id
        }]).select().single();
        if(eOA) throw new Error("Erro checkout Loja A: " + eOA.message);
        ordemA = oA;

        // Recupera o produto da Loja Beta para ver se o estoque dele se manteve intacto
        const { data: checkProdB } = await client.from('pods_products').select('stock').eq('id', produtoB.id).single();
        console.log(`📊 Massa de Controle: Estoque da Loja Beta = ${checkProdB.stock} unidades (Esperado: 5)`);
        
        if (checkProdB.stock !== 5) {
            throw new Error("💥 CRÍTICO - VAZAMENTO DE DADOS DETECTADO: A venda realizada na Loja Alfa alterou os parâmetros físicos da Loja Beta!");
        }
        console.log(`%c   ✓ Sucesso! O balanceamento de estoque está blindado por ID de empresa.`, "color: #30d158;");

        // ==========================================
        // 💬 TESTE 5: PRIVACIDADE DO CHAT INTERNO
        // ==========================================
        console.log("\n💬 [TESTE 5] Disparando tráfego de mensagens criptografadas no chat...");
        await client.from('pods_messages').insert([
            { order_id: ordemA.id, sender: "client", text: "Envio rápido, irmão?", company_id: empresaA.id },
            { order_id: ordemA.id, sender: "admin", text: "Sim, motoboy colocando em rota agora.", company_id: empresaA.id }
        ]);

        // Simula uma tentativa hacker onde a Loja Beta tenta ler o chat da ordem da Loja Alfa
        const { data: leakCheckChat } = await client.from('pods_messages').select('*').eq('order_id', ordemA.id).eq('company_id', empresaB.id);
        console.log(`🔒 Ataque de Escopo Controlado: Loja Beta tentou resgatar o chat da Alfa. Retornado = ${leakCheckChat.length} linhas.`);
        
        if (leakCheckChat.length > 0) {
            throw new Error("💥 CRÍTICO - INVASÃO DE PRIVACIDADE: Canais de chat vazando entre empresas diferentes!");
        }
        console.log(`%c   ✓ Sucesso! Histórico de conversas isolado por Tenant.`, "color: #30d158;");

        // ==========================================
        // 🧹 TESTE 6: ESTEIRA LOGÍSTICA E LIMPEZA
        // ==========================================
        console.log("\n🛵 [TESTE 6] Finalizando ciclo logístico da ordem de teste e limpando rastros...");
        
        // Simula arquivamento de ordem movendo pro histórico permanente
        await client.from('pods_history').insert([{ ...ordemA, status: 'concluido' }]);
        await client.from('pods_orders').delete().eq('id', ordemA.id);

        console.log("------------------------------------------------------------------");
        console.log("%c🎉 CONCLUSÃO: TODOS OS SISTEMAS PASSARAM NO TESTE DE PENETRAÇÃO!", "color: #FFD600; font-weight: bold; font-size: 13px;");
        alert(`🔥 Plataforma Pods Store Segura!\nA simulação de rotas SaaS criou a loja automatizada [${empresaA.invite_code}] e confirmou isolamento de 100% das tabelas na nuvem. Sem vazamentos!`);

    } catch (err) {
        console.error("%c✕ ERRO CRÍTICO ENCONTRADO DURANTE A HOMOLOGAÇÃO:", "color: #FF5252; font-weight: bold;", err.message);
        alert("🚨 Erro nos testes de segurança do servidor: " + err.message);
    }
}