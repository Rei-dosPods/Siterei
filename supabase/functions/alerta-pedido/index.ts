import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.14.0";
import admin from "npm:firebase-admin@11.11.1";

// ⚙️ Inicializa o motor do Firebase Admin com a chave segura do cofre
const serviceAccountStr = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');

if (serviceAccountStr && !admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(serviceAccountStr);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("✅ Firebase Admin inicializado com sucesso.");
    } catch (e) {
        console.error("❌ Erro ao ler FIREBASE_SERVICE_ACCOUNT:", e);
    }
}

serve(async (req) => {
    try {
        // 1. Recebe a carga do Webhook
        const payload = await req.json();
        const ordemAtual = payload.record;
        const ordemAntiga = payload.old_record;

        if (!ordemAtual) {
            return new Response("Ignorado: Nenhuma ordem processada.", { status: 200 });
        }

        console.log(`🚨 Gatilho ativado para Ordem #${ordemAtual.id} | Tipo: ${payload.type}`);

        // 2. Conecta no Supabase passando por cima das regras RLS (Modo Deus/Servidor)
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // ==========================================
        // 🚨 CENÁRIO 1: NOVO PEDIDO (Avisa o Lojista)
        // ==========================================
        if (payload.type === 'INSERT') {
            const { data: lojista } = await supabase
                .from('pods_users')
                .select('push_token')
                .eq('company_id', ordemAtual.company_id)
                .eq('role', 'vendor')
                .single();
            
            if (lojista?.push_token) {
                await admin.messaging().send({
                    token: lojista.push_token,
                    notification: { 
                        title: '🚨 NOVO PEDIDO NA LOJA!', 
                        body: `Ordem #${ordemAtual.id} - Faturamento: R$ ${ordemAtual.total_price}. Vai preparar!` 
                    },
                    data: { url: '/' },
                    // ⚡ MOTOR DE ALTA PRIORIDADE (FURA BLOQUEIO DE BATERIA DO ANDROID/IOS)
                    android: { 
                        priority: 'high', 
                        notification: { sound: 'default', color: '#00DFD8' } 
                    },
                    webpush: { 
                        headers: { Urgency: 'high' } 
                    }
                });
                console.log("🔥 Push de NOVO PEDIDO enviado ao Lojista!");
            } else {
                console.log("❌ Lojista não possui push_token ativo.");
            }
        }
        
        // ==========================================
        // 🛵 CENÁRIO 2: MUDANÇA DE STATUS (Avisa o Cliente)
        // ==========================================
        else if (payload.type === 'UPDATE' && ordemAntiga && ordemAtual.status !== ordemAntiga.status) {
            const { data: cliente } = await supabase
                .from('pods_users')
                .select('push_token')
                .eq('phone', ordemAtual.client_phone)
                .single();
            
            if (cliente?.push_token) {
                await admin.messaging().send({
                    token: cliente.push_token,
                    notification: { 
                        title: 'Atualização Logística 🛵', 
                        body: `Seu pedido #${ordemAtual.id} mudou para: ${ordemAtual.status.toUpperCase()}` 
                    },
                    data: { url: '/' },
                    // ⚡ MOTOR DE ALTA PRIORIDADE (FURA BLOQUEIO DE BATERIA DO ANDROID/IOS)
                    android: { 
                        priority: 'high', 
                        notification: { sound: 'default', color: '#00DFD8' } 
                    },
                    webpush: { 
                        headers: { Urgency: 'high' } 
                    }
                });
                console.log("🔥 Push de ATUALIZAÇÃO LOGÍSTICA enviado ao Cliente!");
            } else {
                console.log("❌ Cliente não possui push_token ativo.");
            }
        }

        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error("💥 Erro fatal na Edge Function:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
});