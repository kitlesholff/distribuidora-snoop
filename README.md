# Distribuidora Snoop — catálogo e pedidos

Projeto responsivo e editável em HTML, CSS e JavaScript, criado para uma distribuidora de bebidas em Alvarães. Não foi publicado.

## Abrir no VS Code

1. Extraia o ZIP.
2. Abra a pasta no VS Code.
3. Instale a extensão **Live Server**.
4. Clique com o botão direito em `index.html` e escolha **Open with Live Server**.
5. Para abrir o painel, digite manualmente `/admin.html` no final do endereço. A página principal não contém link para ele.

No modo local, o PIN inicial do painel é **3525**. Altere `demoAdminPin` em `js/config.js`.

## Onde editar

- Telefone, nome, PIN e conexão do banco: `js/config.js`
- Produtos e preços iniciais: `js/data.js`
- Cores e layout: `styles.css`
- Página do cliente: `index.html`
- Painel: `admin.html`
- Imagens: `assets/produtos/`

Os preços do projeto são exemplos e precisam ser conferidos com o estabelecimento antes do uso real.

## Como funciona a verificação

Antes de abrir o WhatsApp, o site registra o pedido e cria um código como `SN123456`. A mensagem leva o mesmo código e o total calculado. No painel, o responsável compara código, produtos e total com a mensagem recebida. Se o cliente editar o preço no WhatsApp, o valor não baterá com o registro do painel.

Um site comum não consegue ler a mensagem realmente enviada pelo WhatsApp. Para confirmação automática da conversa seria necessário contratar e configurar a API oficial do WhatsApp Business. Este projeto usa a conferência manual segura pelo código do pedido.

## Teste local e uso real

Sem banco configurado, catálogo e pedidos são salvos no `localStorage`. Isso permite testar tudo, mas cliente e painel precisam estar no mesmo navegador.

Para receber pedidos do celular no notebook após publicar:

1. Crie um projeto gratuito no Supabase.
2. Execute `supabase/schema.sql` no SQL Editor.
3. Em **Authentication > Users**, crie o usuário administrador.
4. Copie a URL do projeto e a chave pública `anon` para `js/config.js`.
5. Abra `admin.html` e entre com o e-mail e a senha criados.

Com o Supabase conectado, preços são recalculados dentro do banco antes do pedido ser salvo. O painel pode ser aberto em outro dispositivo e fica protegido por login.

## Publicação futura

Por ser um projeto estático, pode ser publicado no GitHub Pages, Vercel ou Netlify. Não publique o painel usando apenas o PIN local; configure o Supabase primeiro.

## Fechamento de caixa

A aba **Fechamento de caixa**, abaixo de **Saída**, confere o dinheiro físico, resume pagamentos e salva comprovantes diários com histórico de correções e impressão em PDF. Para ativar no banco, execute `supabase/06-fechamento-caixa.sql` no SQL Editor. Veja o passo a passo em [FECHAMENTO-DE-CAIXA.md](FECHAMENTO-DE-CAIXA.md).

## Instalação como aplicativo (PWA)

O catálogo e o painel podem ser instalados pelo navegador como **Snoop** e **Snoop Admin**, respectivamente. Publique os arquivos atualizados na Vercel e siga [PWA-INSTALACAO.md](PWA-INSTALACAO.md). Esta adaptação mantém as funções e o layout atuais e não exige outro SQL. Operações comerciais continuam dependendo de conexão.
