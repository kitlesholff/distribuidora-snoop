# Snoop como aplicativo instalável (PWA)

A PWA mantém as páginas e funções atuais. Acrescenta a instalação pelo navegador, ícones na tela inicial e abertura em janela própria. Não exige alteração no Supabase nem execução de outro SQL.

Há duas opções, conforme a página aberta na instalação:

- **Snoop**: instalando a partir de `index.html` ou da página inicial, o ícone abre o catálogo.
- **Snoop Admin**: instalando a partir de `admin.html`, o ícone abre o painel e usa a autenticação já existente.

## Publicar a adaptação na Vercel

1. Envie os arquivos atualizados deste projeto para o mesmo repositório conectado à Vercel. Se a publicação foi feita por outro método, publique novamente a pasta atualizada por esse método.
2. Aguarde o novo deployment concluir e abra a URL HTTPS de produção.
3. Atualize a página. No celular, abra a URL no navegador, fora do navegador interno do WhatsApp ou Instagram.
4. Instale a partir da página desejada, conforme as instruções abaixo.

Inclua na publicação os manifests, `sw.js`, `js/pwa.js`, `offline.html`, `vercel.json` e `assets/pwa/`, além dos HTML atualizados. Não publique só os HTML. Os arquivos de testes e o script de geração dos ícones não são necessários para executar a aplicação.

## Android

1. Abra o site no Chrome.
2. Para instalar o painel, navegue primeiro até `https://SEU-DOMINIO/admin.html`.
3. No menu do navegador, procure **Instalar aplicativo** ou **Adicionar à tela inicial**. O texto varia conforme a versão do navegador.
4. Confirme e abra pelo ícone criado.

## iPhone e iPad

1. Abra a página desejada no Safari.
2. Toque em **Compartilhar → Adicionar à Tela de Início**.
3. Se aparecer a opção **Abrir como App**, deixe-a ativada e confirme.
4. Abra pelo ícone criado; no painel, entre normalmente quando necessário.

## Computador

No Chrome ou Edge, abra a página desejada e procure o ícone de instalação na barra de endereço ou a opção de instalar no menu do navegador. A oferta de instalação varia por navegador e pode depender de já haver uma instalação daquela versão do app.

Não há botão novo dentro do site: a instalação usa os controles do navegador para preservar o layout.

## Conexão e atualizações

O catálogo e o painel precisam de internet para carregar e consultar os dados. Pedidos, pagamentos, fechamento e autenticação mantêm o comportamento original. A PWA não enfileira operações financeiras para executá-las depois e não cria vendas offline.

Se uma abertura de página falhar por falta de conexão após a primeira visita online, aparece uma tela **Você está sem conexão**, com botão **Tentar novamente**. Se a conexão cair com uma página já aberta, os tratamentos de erro atuais continuam valendo.

O service worker guarda somente essa tela de falta de conexão e sua logo. Ele não salva cópias de pedidos, respostas do Supabase, credenciais, HTML do painel, configuração ou scripts de negócio no cache da PWA. Isso não altera os mecanismos existentes de armazenamento da sessão e do carrinho.

Uma atualização do app não recarrega automaticamente um formulário ou fechamento em uso. Após publicar uma nova versão, finalize a atividade, feche todas as janelas/abas do site e abra novamente. Atualizações do arquivo de tela offline também devem incrementar a versão do cache em `sw.js`.

## Verificação depois do deployment

1. Abra `/manifest.webmanifest` e `/admin.webmanifest` e confirme que retornam JSON, sem erro 404.
2. Abra `/sw.js` e confirme que retorna JavaScript.
3. Em DevTools → Application, confira os manifests e o registro do service worker. Há ícones PNG de 192 e 512 pixels, além de ícone adaptável e ícone Apple de 180 pixels.
4. Instale catálogo e painel pelas respectivas páginas e confira o destino de abertura de cada ícone.
5. Teste a tela de falta de conexão após visitar o site online. Ela não deve mostrar dados administrativos antigos.
6. Reconecte e use Tentar novamente. Confirme que o painel conserva o login e as funções originais.

Use HTTPS em produção ou localhost no desenvolvimento. Abrir o HTML diretamente como arquivo (`file://`) não habilita instalação/service worker. O manifest e o registro não substituem testes de instalação nos dispositivos após publicar.

## Arquivos adicionados

- `manifest.webmanifest`: identidade e abertura do catálogo.
- `admin.webmanifest`: identidade e abertura do painel.
- `js/pwa.js`: registro isolado, sem mudanças na interface.
- `sw.js`: navegação pela rede e tela offline.
- `offline.html`: orientação quando não há conexão.
- `assets/pwa/`: ícones exportados da logo atual.
- `vercel.json`: tipos e atualização dos arquivos de instalação.
- `scripts/generate-pwa-icons.ps1`: geração opcional dos ícones a partir da logo; os PNG prontos já acompanham a entrega.

Referências: [instalação de PWAs](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).
