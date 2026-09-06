# Abertura e fechamento de caixa — nova rotina

## Ativação

Com a estrutura atual e `supabase/06-fechamento-caixa.sql` instaladas, execute as migrações **08, 09 e 10**, nessa ordem. Se o 09 já estiver instalado, execute somente **`supabase/10-rotina-diaria-reset.sql`**. Depois publique os arquivos atualizados do painel. Instalar a migração 10 não apaga dados: ela habilita a rotina diária e o reset administrativo explícito.

O 08 cria sessões, movimentações e comprovantes. O 09 faz a confirmação contabilizar o recebimento automaticamente e bloqueia alterações/exclusões em pedidos confirmados e seus itens. O 10 permite expedientes sucessivos e corrige o reset completo. Não reexecute scripts antigos sem reaplicar as versões seguintes na ordem.

**A migração foi testada em PostgreSQL isolado (PGlite), mas não aplicada à produção nesta alteração.** Sem ela, a tela exibe instruções de ativação. Em modo Supabase, não há gravação local alternativa.

## Uso diário

1. Abra **Fechamento de caixa** e informe o fundo realmente disponível para troco. O saldo anterior não é transferido automaticamente; data, horário e usuário são identificados pelo sistema.
2. Registre pedidos em **Pedidos**. **Confirmar significa que o pagamento já foi recebido.** Confira a forma de pagamento antes de confirmar; o total confiável é registrado automaticamente no caixa aberto.
3. O pedido confirmado é definitivo: não pode voltar para pendente, ser cancelado, ter valores/itens modificados ou ser excluído. Repetir a mesma confirmação não duplica o recebimento. Dinheiro aumenta a gaveta; Pix e cartão entram nos recebimentos digitais. Não há lançamento manual adicional de recebimentos. Esta rotina usa a forma cadastrada no pedido; não há novo fluxo de pagamento dividido.
4. Cadastre despesas em **Saída** ou no caixa: os dois caminhos registram a mesma movimentação uma única vez. Sangria, reforço e devolução têm tipos próprios na tela de caixa.
5. Em **Outros pagamentos**, consulte o Pix/cartão já recebido pela confirmação. A conferência acontece antes de confirmar o pedido; não é exigida novamente para esses recebimentos. Cartão aprovado é valor bruto de venda, não depósito da operadora. Não há integração bancária ou cálculo automático de taxas.
6. No fechamento normal, informe apenas **dinheiro contado na gaveta**. Pode usar o contador de notas/moedas. Falta, sobra e correção exigem justificativa.
7. Somente pedidos com status **pendente** aparecem aguardando confirmação. Cancelados representam compras adiadas e não geram entrada. Pode manter pedidos pendentes para outro expediente, com justificativa. Se o cliente desistir após uma compra confirmada, registre o valor como **saída de caixa**, identificando a devolução; preserve o pedido confirmado.
8. Clique em **Conferir e fechar caixa**, revise o resumo e confirme. O servidor recalcula e recusa a gravação se os dados mudaram.
9. O caixa encerrado vai para **Histórico de fechamentos** e a tela volta à abertura. No próximo expediente, informe novamente o fundo realmente disponível. A abertura cria outro caixa; não reabre nem altera o anterior.

## Cálculo e datas

**Esperado = fundo inicial + recebimentos em dinheiro + reforços − despesas em dinheiro − sangrias − devoluções em dinheiro.**

Exemplo: fundo de R$ 100 + recebimento de R$ 40 + reforço de R$ 20 − despesa de R$ 25 − sangria de R$ 10 − devolução de R$ 5 = **R$ 120 esperados**. Pix/cartão ficam fora da gaveta.

O recebimento usa o horário da confirmação e pertence ao caixa aberto. Um pedido criado ontem e confirmado hoje entra na sessão atual. Sem caixa aberto, a confirmação é recusada e o pedido continua pendente. A data exibida é a abertura em `America/Manaus` (Alvarães). Se o expediente atravessar a meia-noite, continua na sessão aberta; encerre-a antes de abrir a seguinte. Há no máximo um caixa aberto, mas podem existir vários expedientes encerrados na mesma data. Cada expediente tem seu fundo, vendas, contagem e comprovantes; vendas do anterior não são somadas outra vez.

A tela se atualiza ao entrar, voltar à janela, após lançamentos e a cada 15 segundos enquanto visível. A contagem digitada é preservada. O servidor verifica novamente os dados ao salvar.

## Transição dos registros anteriores

Os comprovantes antigos ficam em **Histórico → Fechamentos anteriores à nova rotina**. A migração 09 retira os confirmados das pendências. Para o caixa aberto, completa o valor dos confirmados da mesma data ou que já tenham recebimento parcial nessa sessão, descontando todos os recebimentos anteriormente registrados para o pedido. A migração também reconhece como conferidos os recebimentos desses confirmados no caixa aberto.

Para confirmados antigos sem horário de confirmação, a compatibilização usa a data de criação como referência e identifica o lançamento como **Confirmação anterior**. Não inventa um horário de recebimento real. Vendas antigas de outras datas não são transferidas para a gaveta atual; comprovantes já fechados não são recalculados silenciosamente. Os confirmados antigos continuam contabilizados nos relatórios de pedidos e deixam de ser tratados como valores a receber.

## Histórico e limites

- Cada fechamento preserva fundo, movimentos, pendências, contagem, diferença, motivo, usuário e horário. As versões não devem ser somadas.
- Depois de fechar, os lançamentos da sessão não podem ser alterados. **Corrigir contagem**, no caixa ou histórico, cria uma versão com justificativa. Corrige a contagem física; não reescreve fundo, recebimentos ou despesas.
- Devoluções exigem recebimento original, mesma forma de pagamento e valor dentro do recebido ainda não devolvido. O ID consta nos lançamentos e comprovantes; para outro caixa, informe-o no campo de recebimento anterior. Devolver não recria automaticamente uma dívida do cliente.
- Despesas vinculadas ao caixa não podem ser excluídas individualmente. O fechamento normal preserva todos os comprovantes. Apenas o **reset geral explícito** descrito abaixo remove esses dados em conjunto.
- O comprovante pode ser impresso ou salvo em PDF pelo navegador.
- **Painel** e relatório geral continuam resumindo pedidos confirmados e despesas. A conferência dos recebimentos efetivos e dinheiro físico está em **Fechamento de caixa**.
- No modo local, os dados de demonstração ficam no navegador. Identidade validada, transações e proteção contra alterações diretas dependem do Supabase.

## Limpeza dos dados de teste antes da entrega

Em **Controle geral → Começar do zero → Iniciar reset protegido**, informe a senha atual e digite **ZERAR**. Confirme **Apagar histórico**.

Essa operação apaga todos os pedidos (inclusive confirmados), itens vendidos, saídas, recebimentos, caixas abertos/encerrados e históricos de fechamentos, inclusive versões antigas. Funciona também quando há somente um caixa vazio, sem pedidos ou despesas. Não distingue registros de teste de registros reais: é uma limpeza geral.

Produtos, categorias, disponibilidade, imagens e acesso administrativo são preservados. O sistema fica pronto para uma primeira abertura limpa. O reset não faz parte do fechamento diário; use-o para a preparação da entrega conforme necessário. Em modo Supabase a limpeza é uma transação única, com acesso administrativo e confirmação explícita. A instalação do SQL não executa a limpeza.

## Testes isolados

```text
node tests/cash-register-sql.cjs
node tests/order-confirmation-sql.cjs
node --test tests/cash-register.browser.cjs
node --test tests/cash-closing.test.cjs tests/pwa.test.cjs
```

O teste do 08 preserva a validação da migração anterior. O teste do 09 cobre confirmação com dinheiro/Pix/cartão, reconfirmação sem duplicação, compatibilização de confirmados anteriores, bloqueio de edição/exclusão de pedidos e itens, saída posterior, permissões e fechamento. O teste de navegador usa a rotina atual. Nenhum teste acessa produção.
