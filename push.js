import { execSync } from 'child_process';
import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('🚀 Preparando envio para o GitHub...');

try {
    // O Git já lê o .gitignore automaticamente no 'git add .'
    execSync('git add .', { stdio: 'inherit' });

    rl.question('💬 Digite a mensagem do commit: ', (mensagem) => {
        const commitMsg = mensagem.trim() || 'Atualização automática do catálogo';
        
        try {
            console.log('\n📦 Criando commit...');
            execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });

            console.log('\n📤 Subindo para o GitHub...');
            // Ajuste 'main' para 'master' se a sua branch principal tiver o nome antigo
            execSync('git push origin main', { stdio: 'inherit' });

            console.log('\n✅ Código atualizado no GitHub com sucesso! 🚀🔥');
        } catch (error) {
            console.log('\n❌ Erro ao fazer o commit ou push. Verifique seu terminal.');
        }
        rl.close();
    });
} catch (error) {
    console.log('❌ Erro ao adicionar os arquivos (git add).');
    rl.close();
}