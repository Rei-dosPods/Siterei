import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.14.0";
import admin from "npm:firebase-admin@11.11.1"; // Importa o motor oficial do Google

// ⚙️ Inicializa o Firebase Admin com a chave que guardamos no cofre do Supabase
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
        // 1. Recebe o disparo do Webhook
        const payload = await req.json();
        const novaOrdem = payload.record;

        if (payload.type !== 'INSERT' || !novaOrdem) {
            return new Response("Ignorado: Não é uma nova ordem.", { status: 200 });
        }

        console.log(`🚨 Novo pedido detectado: Ordem #${novaOrdem.id}`);

        // 2. Conecta no banco passando por cima das regras (Modo Servidor)
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // 3. Busca o Push Token do Lojista
        const { data: lojista } = await supabase
            .from('pods_users')
            .select('push_token')
            .eq('company_id', novaOrdem.company_id)
            .eq('role', 'vendor')
            .single();

        if (!lojista || !lojista.push_token) {
            console.log("❌ Lojista não tem push_token ativo.");
            return new Response("Sem push_token", { status: 200 });
        }

        // 4. Monta a Notificação que vai acordar o celular
        const message = {
            notification: {
                title: '🚨 NOVO PEDIDO NA LOJA!',
                body: `Ordem #${novaOrdem.id} no valor de R$ ${novaOrdem.total_price}. Vai preparar!`
            },
            data: {
                url: '/' 
            },
            token: lojista.push_token // O endereço exato do celular do lojista
        };

        // 5. Dispara o míssil via Firebase Admin (Padrão HTTP v1)
        const fcmResult = await admin.messaging().send(message);
        console.log("🔥 Push disparado com sucesso!", fcmResult);

        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error("💥 Erro fatal no Back-End:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
});