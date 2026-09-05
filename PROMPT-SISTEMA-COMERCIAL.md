# Prompt para gerar um sistema comercial reutilizável

Atue como desenvolvedor full-stack sênior, especialista em Supabase, experiência do usuário e sistemas de gestão para pequenos estabelecimentos.

Desenvolva e entregue um sistema web completo, funcional e personalizável, com catálogo público, pedidos pelo WhatsApp e painel administrativo com controle financeiro e fechamento diário de caixa.

O produto será oferecido a diferentes estabelecimentos. Cada cliente terá sua própria cópia do site e seu próprio projeto Supabase. Não implemente um SaaS multitenant, assinaturas ou cobrança recorrente. A prioridade é facilitar instalação, personalização e manutenção, com todos os módulos integrados desde a primeira entrega.

Crie efetivamente todos os arquivos e pastas. Não entregue apenas uma proposta, um protótipo visual ou trechos de código.

## 1. Dados do estabelecimento

Use estes parâmetros como única fonte inicial de personalização:

- Nome: [NOME DO ESTABELECIMENTO]
- Segmento: [DISTRIBUIDORA, MERCEARIA, LANCHONETE OU OUTRO]
- Cidade e estado: [CIDADE / UF]
- Endereço: [ENDEREÇO]
- WhatsApp com código do país e DDD: [WHATSAPP]
- Horário de atendimento: [HORÁRIOS]
- Fuso horário IANA: [EX.: America/Manaus OU America/Sao_Paulo]
- Cor principal: [COR HEXADECIMAL]
- Cor secundária: [COR HEXADECIMAL]
- Tema preferido: [CLARO OU ESCURO]
- Logotipo: [ARQUIVO FORNECIDO OU LOGO PROVISÓRIO]
- Entrega e retirada: [MODALIDADES DISPONÍVEIS]
- Taxa de entrega: [VALOR FIXO OU ZERO]
- Formas de pagamento: [PIX, DINHEIRO, CRÉDITO, DÉBITO]

Se algum dado comercial não for informado, use um exemplo genérico identificado como demonstração. Não invente credenciais, endereços reais ou imagens de marcas como se tivessem sido fornecidos. Registre as suposições no guia de personalização e continue implementando.

Centralize identidade visual, textos, contatos, moeda BRL e configurações comerciais. Permita editar pelo painel nome, contato, horários, logo, cores, modalidades e carrossel. URL do Supabase e chave pública ficam em um único arquivo de conexão. Regras comerciais utilizadas nos cálculos devem ter uma fonte oficial no banco, sem depender de valores manipuláveis no navegador.

## 2. Arquitetura e entrega dos arquivos

Utilize HTML, CSS e JavaScript modular para o frontend e Supabase para PostgreSQL, Auth e Storage. O site deve funcionar como arquivos estáticos, sem exigir um servidor Node em produção. Evite dependências desnecessárias e fixe as versões utilizadas.

Sugestão de organização, adaptável se houver uma justificativa concreta:

    projeto/
      public/
        index.html
        admin.html
        config.js
        css/
          tokens.css
          storefront.css
          admin.css
          print.css
        js/
          shared/
          storefront/
          admin/
        assets/
          branding/
          products/
          carousel/
          icons/
      supabase/
        instalar.sql
        verificar-instalacao.sql
        functions/
          reset-data/
            index.ts
      tests/
      docs/
        INSTALACAO.md
        MANUAL-DO-LOJISTA.md
        PERSONALIZACAO.md
        PUBLICACAO.md
      README.md
      .gitignore

Crie todo arquivo referenciado por HTML, CSS, JavaScript ou documentação. Inclua ícones e imagens de exemplo utilizáveis, sem links quebrados. Pode usar recursos visuais locais genéricos quando não houver fotos fornecidas. Não faça a instalação depender de arquivos de outro projeto ou de etapas de conversas anteriores.

## 3. Identidade visual e experiência

Crie uma interface profissional, com tipografia legível, hierarquia clara, espaçamento consistente, ícones SVG padronizados, estados de foco, contraste adequado e adaptação a celular, tablet e computador.

A página pública deve destacar as imagens e os produtos. Use um carrossel grande na área principal, com uma imagem por vez, setas, indicadores, navegação por toque e controles acessíveis. Não sobreponha nomes e descrições às imagens. O número de slides deve ser configurável, sem depender de exatamente 11 itens. Respeite a preferência de movimento reduzido e permita pausar a rotação.

Use uma faixa compacta de benefícios com ícones, aproveitando o espaço para o catálogo e o carrossel. Adapte o fundo ao segmento e preserve a leitura. Não reutilize o nome, as imagens ou a identidade da Snoop em outros clientes.

Todo botão precisa funcionar, incluindo Fechar, Cancelar, Voltar, Salvar, Atualizar e Sair. Modais devem fechar sem exigir o preenchimento dos campos obrigatórios. Mostre carregamento, confirmação de sucesso, erro recuperável e estado vazio dentro do contexto da ação; mensagens não podem ficar escondidas atrás dos modais.

## 4. Catálogo público e pedido

Implemente:

- Cabeçalho com logotipo, nome e acesso ao carrinho.
- Busca por nome e descrição e filtro por categoria.
- Produtos com foto, nome, descrição, categoria e preço.
- Carrinho com alteração de quantidades, remoção, subtotais, entrega e total.
- Checkout com nome, modalidade de entrega/retirada, endereço quando necessário, pagamento e observações.
- Carrinho persistente neste navegador, sem tratar dados locais como fonte oficial dos pedidos.
- Produtos em falta ou desativados ausentes do catálogo público.

Ao finalizar, registre o pedido no banco ANTES de preparar a mensagem do WhatsApp. O banco deve consultar preços, disponibilidade e taxa de entrega oficiais e devolver código, itens e total calculado. Rejeite quantidades inválidas, produtos indisponíveis e qualquer carrinho parcialmente inválido: não descarte itens silenciosamente.

Use uma chave de idempotência para evitar pedidos duplicados em cliques repetidos ou tentativas após falhas. Gere códigos realmente únicos. Se o WhatsApp não abrir, mostre um link de continuação e mantenha visível o código do pedido já salvo. Não crie outro pedido ao tentar abrir a mensagem novamente.

O envio da mensagem é realizado pelo cliente no WhatsApp. Não apresente a abertura do link como prova de mensagem enviada, pagamento recebido ou venda confirmada.

## 5. Login e administração

Entregue `admin.html` funcionando com login por e-mail e senha do Supabase Auth, recuperação de senha e encerramento da sessão.

Login e painel devem ser visualmente exclusivos. Enquanto a sessão é verificada, mostre um estado neutro. Depois de entrar, remova o formulário de login da tela; a ação de sessão disponível deve ser Sair. Proteja o acesso com autorização no banco, não apenas ocultando elementos.

Crie os menus nesta ordem:

1. Pedidos
2. Confirmados
3. Cancelados
4. Produtos
5. Painel
6. Saída
7. Fechamento de caixa
8. Controle geral

Mantenha configurações comerciais dentro de Controle geral. Inclua menu lateral responsivo, indicadores de conexão e contadores de pedidos coerentes.

## 6. Pedidos e vendas presenciais

Na aba Pedidos, mostre somente pedidos pendentes. Cada linha deve ter cliente, código, data, origem, pagamento, status, total e botões Confirmar, Cancelar e Detalhes. Confirmar e cancelar devem funcionar sem abrir Detalhes.

Ao mudar o status, mova o pedido imediatamente para a lista correspondente e atualize contadores e totais. Ao recarregar, ele deve continuar na lista correta.

Atualize os pedidos automaticamente a cada 10 segundos, evitando requisições sobrepostas e timers duplicados. Mantenha um botão Atualizar com ícone, preenchimento destacado e estilo consistente com + Pedido presencial. Preserve filtros, rolagem e campos em edição durante a atualização. Identifique a última sincronização e falhas de conexão.

Em Confirmados e Cancelados, permita retornar para pendente ou mudar o status, mas exija uma caixa de confirmação antes de alterar um pedido já decidido. Registre alterações com usuário, horário, status anterior e novo status.

Inclua + Pedido presencial com produtos cadastrados, quantidades, cliente opcional identificado como Cliente balcão, pagamento, observações e status inicial. Gravação dos itens e do status inicial deve ser atômica.

Use um campo próprio de origem, como online ou presencial. Não deduza a origem pelo texto do endereço. Pedidos presenciais precisam aparecer nos totais, relatórios, gráficos, pagamentos e fechamento do dia.

## 7. Produtos, categorias e imagens

Permita cadastrar, editar e remover ou arquivar produtos com nome, descrição, preço, categoria, imagem e disponibilidade. Preserve os dados históricos dos itens vendidos quando o catálogo mudar.

Inclua filtro por categoria e busca no painel. Permita criar, renomear e remover categorias. Se uma categoria tiver produtos, peça realocação antes de removê-la. Use identificadores estáveis para que renomear categorias não quebre vínculos.

Inclua Marcar em falta e Reativar. Um item em falta continua visível ao administrador e desaparece do catálogo público. Não implemente contagem automática de unidades em estoque nesta versão.

Implemente upload para Supabase Storage com prévia, validação de tamanho e formato, indicador de envio e tratamento de falhas. Aceite JPEG, PNG, WebP e AVIF, até 5 MB. Imagens públicas podem ser lidas pelos clientes; criação, alteração e exclusão ficam restritas aos administradores. Não apague uma imagem ainda utilizada nem deixe a gravação do produto quebrada quando o upload falhar.

## 8. Painel financeiro interativo

Mostre dados reais, filtros Hoje, Últimos 7 dias, Últimos 30 dias e intervalo personalizado, com gráficos, legendas e detalhes ao interagir.

Inclua vendas confirmadas, receita pendente em laranja, cancelamentos, despesas, saldo das movimentações, ticket médio, taxa de confirmação, evolução diária, meios de pagamento, produtos mais vendidos, movimentos recentes e comparação entre vendas online e presenciais.

Defina as fórmulas e mantenha-as iguais nas listas, no dashboard e nas exportações. Confirmados somam receita; cancelados e pendentes não somam receita confirmada. Uma mudança de status deve alterar os totais uma única vez. Não rotule vendas menos despesas registradas como lucro líquido.

Agregue os dados no banco. Listas paginadas ou limites de 1.000 registros não podem produzir totais incompletos.

## 9. Saídas financeiras

Cada saída deve registrar data, descrição/observação, valor, pessoa responsável e forma de pagamento ou origem do dinheiro. No formulário, solicite somente a data, sem campo de hora. Guarde separadamente o horário e o usuário que cadastraram o lançamento.

Inclua filtros por data e responsável, histórico e confirmação antes de exclusão ou correção. Atualize dashboard e conferência de caixa após alterações.

A forma de pagamento da saída é obrigatória para identificar automaticamente quais despesas reduziram o dinheiro físico e quais foram pagas por Pix, cartão ou outro meio.

## 10. Fechamento diário de caixa

Use o fuso IANA configurado para o estabelecimento em todas as telas e funções do banco. Não dependa do fuso do computador do operador.

Defina uma data comercial estável para cada pedido, inicialmente derivada da criação no fuso da loja. Saídas seguem a data informada no lançamento. Adote essa mesma base no fechamento e nos filtros financeiros. Explique que confirmar posteriormente um pedido de uma data anterior altera a conferência daquele dia e pode exigir uma nova versão do fechamento.

Para a data selecionada, apresente pedidos confirmados, cancelados e pendentes, valores por pagamento, vendas online e presenciais, saídas e saldo das movimentações. Bloqueie o fechamento enquanto existirem pedidos pendentes naquela data e ofereça acesso fácil à lista para resolvê-los.

Solicite dinheiro inicial, dinheiro contado, responsável e observações. Calcule automaticamente as saídas em dinheiro a partir dos lançamentos. Não desconte essas despesas duas vezes.

Fórmulas:

    dinheiro esperado = dinheiro inicial + vendas confirmadas em dinheiro − saídas em dinheiro
    diferença = dinheiro contado − dinheiro esperado

Pix e cartões aparecem nas vendas, mas não entram na contagem física. Exija observação para diferenças. O valor inicial é informado pelo operador; não transporte saldos automaticamente sem uma regra explícita.

Ao salvar, recalcule tudo no banco e verifique se os movimentos ou a versão do fechamento mudaram desde a conferência. Recuse a gravação desatualizada. Proteja contra cliques duplicados e fechamentos concorrentes.

Salve um comprovante imutável contendo totais, pagamentos, pedidos, itens, saídas, contagem, responsável e data/hora. Permita consulta por dia e mês, impressão e PDF.

Alterações posteriores não podem reescrever um comprovante salvo. Ofereça Registrar correção com motivo obrigatório, criando uma nova versão. Identifique a versão mais recente e nunca some diferentes versões do mesmo dia como receitas independentes.

## 11. Controle geral, exportação e reset

Inclua resumo dos registros, configurações comerciais, exportação de dados e reset operacional.

Exporte pedidos, itens, status, pagamentos, canais de venda, saídas, produtos e fechamentos em CSV compatível com Excel e em relatório para impressão/PDF. A exportação deve abranger todo o período escolhido e todos os registros, inclusive além do limite padrão da API. Preserve acentos, datas e números; neutralize conteúdo que possa ser interpretado como fórmula em planilhas.

No reset, mostre exatamente o que será apagado e preserve catálogo, categorias, imagens, configurações e histórico dos fechamentos. Explique que os comprovantes preservam cópias dos movimentos antigos. Exija senha atual e a palavra ZERAR. Recomende exportar antes e nunca dispare a exclusão ao instalar o SQL.

A confirmação de senha não pode existir apenas no frontend. Entregue uma Edge Function reset-data que valide a sessão, a condição de administrador e a senha atual usando Supabase Auth. A exclusão deve ocorrer por uma operação atômica no banco, acessível somente ao backend autorizado. Não deixe uma RPC alternativa disponível ao navegador que contorne a reautenticação. Nunca registre senhas nos logs nem envie credenciais privilegiadas ao frontend.

Inclua tratamento de erros, limitação de tentativas apropriada, controle de chamadas repetidas e um registro de auditoria do reset. Mantenha a proteção do banco contra DELETE sem condição; todas as exclusões intencionais devem declarar seu escopo.

## 12. Segurança e integridade

Ative RLS em todas as tabelas expostas. Visitantes podem ler somente configurações públicas, categorias públicas e produtos disponíveis, além de registrar um pedido por uma função controlada. Não permita consultar pedidos de outros clientes, despesas, fechamentos, administradores ou auditoria.

Um usuário autenticado não é automaticamente administrador. Use uma lista explícita de administradores vinculada ao UUID do Supabase Auth e um verificador central de autorização. Não permita que o próprio usuário promova sua conta, altere essa lista ou assuma privilégios através de metadados editáveis.

Use funções transacionais para criar pedidos, mudar status, fechar caixa e resetar dados. Restrinja permissões de execução e configure search_path de funções privilegiadas. Dinheiro deve usar centavos inteiros ou numeric com precisão adequada, e nunca depender exclusivamente de cálculos do navegador.

Valide comprimentos, quantidades, identificadores, URLs e arquivos. Renderize textos de clientes de modo seguro contra injeção de HTML e scripts. Preveja idempotência, paginação e falhas de rede. Evite a exposição indiscriminada de dados pessoais.

Não adicione PIN fixo de produção, senha padrão, service_role no navegador ou fallback silencioso para localStorage quando a conexão ao banco falhar. Se houver demonstração local, ela deve ser explícita, isolada e identificada visualmente.

## 13. Um único SQL de instalação

Entregue supabase/instalar.sql completo, autocontido e organizado para um projeto Supabase novo. Ele deve criar, na ordem correta, tabelas, vínculos, índices, constraints, autorização administrativa, funções, políticas RLS, permissões, bucket de imagens e políticas de Storage.

Não faça referência a scripts 01, 02, 03 de outro projeto. Verificações e funções auxiliares devem existir antes de qualquer política que dependa delas.

Para cadastrar o primeiro administrador:

1. Oriente criar o usuário por Authentication no Supabase.
2. Reserve um único ponto claramente sinalizado no início do SQL para informar o UUID desse usuário.
3. Valide que o UUID pertence a uma conta existente antes de autorizar o administrador.
4. Não escreva manualmente senhas ou usuários nas tabelas internas do Auth.

O SQL deve poder ser reexecutado sem apagar dados, restaurar configurações antigas ou duplicar produtos e políticas. Separe demonstrações opcionais do histórico real: não insira vendas, despesas ou fechamentos fictícios como registros de produção.

Entregue verificar-instalacao.sql somente de leitura, com verificações de objetos, funções, políticas e permissões. Instalar e verificar não devem executar o reset nem gerar um fechamento.

## 14. Instalação e personalização para outro cliente

Escreva um guia para iniciantes que cubra:

1. Criar um projeto Supabase separado para o estabelecimento.
2. Criar a conta administrativa e copiar seu UUID.
3. Preencher o UUID e executar instalar.sql no SQL Editor.
4. Copiar URL e chave pública para public/config.js, sem divulgar chaves privadas.
5. Publicar a função reset-data e configurar o necessário, com instruções exatas e código integral; não presumir que SQL instala Edge Functions.
6. Abrir o site localmente e entrar em admin.html.
7. Configurar identidade, contatos, horários, formas de entrega e imagens.
8. Cadastrar categorias e produtos.
9. Publicar a pasta public em hospedagem estática HTTPS e configurar domínio e URLs de recuperação de senha.
10. Executar um pedido de teste e conferir sua passagem por pedidos, receitas, saídas e fechamento.

Explique claramente que o SQL prepara o backend, enquanto index.html e admin.html são os arquivos do site. A criação de credenciais, a configuração da conexão, a publicação da função e a hospedagem continuam sendo etapas de instalação, mesmo com todo o código pronto.

Entregue também um roteiro curto para duplicar a solução para outro estabelecimento sem alterar os módulos de pedidos e finanças.

## 15. Testes e critérios de aceite

Teste cálculos e permissões em ambiente isolado. Verifique os fluxos visuais no navegador quando houver acesso e informe com precisão o que não pôde ser verificado. Não apague dados reais, não dispare reset de produção e não publique automaticamente para testar.

A entrega deve demonstrar que:

- Login e painel nunca aparecem juntos após a autenticação.
- Uma conta sem autorização administrativa não acessa dados internos.
- Pedido confirmado ou cancelado sai da fila de pendentes imediatamente e continua correto após recarregar.
- Atualização automática de 10 segundos não duplica requisições nem perde campos em edição.
- Vendas presenciais entram em todos os indicadores e relatórios.
- Alteração de preço no navegador não muda o total oficial e uma tentativa repetida não duplica o pedido.
- Produto em falta some do catálogo e não pode ser comprado com um carrinho antigo.
- Upload, categorias, filtros e botões de fechar/cancelar funcionam.
- Saídas pagas por Pix não reduzem o dinheiro esperado na gaveta.
- Datas e fronteiras de meia-noite respeitam o fuso da loja.
- Centavos, pendências, diferenças, alterações concorrentes e versões dos fechamentos são tratados corretamente.
- PDF e CSV contêm os registros completos e valores coerentes, inclusive com mais de 1.000 pedidos.
- O reset rejeita senha errada e chamadas diretas não autorizadas; em caso de erro não apaga só parte dos registros.
- O SQL instala em banco vazio compatível e a reexecução preserva os registros existentes.
- Não há dependências ausentes, imagens quebradas, erros JavaScript ou botões sem ação.

## 16. Forma de trabalhar e entrega final

Implemente o sistema completo seguindo estes requisitos. Faça escolhas técnicas coerentes para detalhes não especificados e documente as suposições. Não interrompa para solicitar decisões triviais e não acrescente módulos de ERP, integrações bancárias ou pagamentos online fora do escopo.

Se houver acesso ao workspace, crie os arquivos diretamente em uma pasta nova, sem sobrescrever projetos existentes. Se não houver, entregue o conteúdo integral de cada arquivo com seu caminho. Não use reticências, pseudocódigo, funções vazias, TODOs ou instruções para que eu desenvolva partes restantes.

Antes de encerrar, revise o projeto como um sistema integrado. Entregue a árvore final, arquivos completos, SQL único, função do reset, recursos visuais, documentação e resultados dos testes. Disponibilize um ZIP quando o ambiente permitir. Distinga implementação concluída de configuração externa pendente e não afirme que instalou, publicou ou testou algo que não executou.

O resultado esperado é uma base comercial que eu possa copiar para cada cliente, configurar, instalar no Supabase e entregar com o catálogo público e o painel administrativo funcionando.
