# Fechamento de caixa da Snoop

## Ativação no Supabase (uma vez)

1. Abra `supabase/06-fechamento-caixa.sql` no VS Code e copie **todo o arquivo**.
2. No projeto Supabase da loja, abra **SQL Editor → New query**.
3. Cole o conteúdo e clique em **Run**. Aguarde a confirmação de sucesso.
4. Atualize `admin.html` no navegador com `Ctrl + F5`.

Esse script cria a tabela de comprovantes e as funções de conferência. Não apaga registros e não fecha nenhum dia. Depende da estrutura de pedidos, da função `is_admin()` (script 01) e das saídas (script 02) já utilizadas pelo painel. Pode ser executado novamente para atualizar as funções.

## Rotina no fim do dia

1. Registre as vendas de balcão em **Pedidos → + Pedido presencial** e todas as despesas na aba **Saída**.
2. Confirme ou cancele os pedidos pendentes do dia. Pedidos pendentes impedem o fechamento.
3. Abra **Fechamento de caixa**, abaixo de **Saída**, e selecione a data.
4. Confira vendas, formas de pagamento e saídas. Use **Conferir pedidos e saídas do dia** para ver os lançamentos.
5. Informe o **dinheiro inicial**: o troco que já estava na gaveta antes das vendas.
6. Informe **saídas em dinheiro**: somente a parte das despesas já cadastradas que foi paga com notas e moedas. Se nenhuma foi paga em dinheiro, informe `0`. Despesas pagas por Pix ou cartão não entram neste campo. Ele classifica as saídas existentes; não cria outra despesa.
7. Conte as notas e moedas e preencha **dinheiro contado**. Não some Pix nem vendas no cartão.
8. Informe o responsável. Em caso de sobra ou falta, descreva o motivo nas observações.
9. Clique em **Conferir e fechar caixa**, revise os valores e clique em **Confirmar fechamento**.
10. O comprovante abre automaticamente. Use **Imprimir / Salvar PDF** e escolha **Salvar como PDF** no diálogo de impressão.

Exemplo: R$ 100 de troco inicial + R$ 300 vendidos em dinheiro − R$ 50 de saídas em dinheiro = **R$ 350 esperados**. Se contar R$ 340, o sistema registra **falta de R$ 10**. Vendas por Pix e cartão aparecem na receita do dia, mas não aumentam o dinheiro esperado na gaveta.

## Datas e valores

- O dia vai de 00h a 23h59 no horário de **Alvarães/AM (America/Manaus)**, independentemente do fuso do computador.
- Vendas seguem a **data de criação do pedido** e só somam quando confirmadas. Um pedido criado ontem e confirmado hoje pertence à conferência de ontem. Se ontem já estiver fechado, registre uma correção de ontem.
- Saídas seguem a data informada no lançamento.
- Saldo das movimentações = vendas confirmadas − todas as saídas. É diferente do dinheiro físico e não representa lucro líquido.
- Pix e cartões mostram os valores brutos registrados. Não há integração com banco, operadora ou desconto automático de taxas. Cadastre as taxas como saída quando aplicável.
- O valor inicial de cada dia é informado manualmente. O saldo de ontem não é transportado automaticamente.
- A conferência é atualizada ao abrir a aba ou clicar em **Atualizar conferência**. Ao salvar, o banco reconfere os movimentos: se mudaram, volte, atualize e revise.

## Histórico e correções

Use o seletor de mês para consultar comprovantes e versões anteriores. O sistema salva uma cópia dos pedidos, itens, saídas e totais, além do responsável e do horário de fechamento.

O fechamento não bloqueia novas vendas ou alterações nos pedidos. Se houver alteração posterior, ao abrir o dia novamente o painel avisa que os movimentos mudaram. Use **Registrar correção**, confira a contagem, explique o motivo e salve. Isso cria a próxima versão do mesmo dia, sem substituir a anterior. Para consultar o resultado válido, use a versão marcada **Mais recente**; não some as versões de um mesmo dia.

O fechamento também não limpa pedidos. O reset do **Controle geral** continua apagando pedidos e saídas, mas **preserva os comprovantes de caixa**, inclusive as cópias dos movimentos que eles contêm. Essa preservação aparece no aviso do reset.

No modo local, os fechamentos ficam apenas neste navegador; com Supabase, ficam no banco e são visíveis aos administradores autorizados. Em modo conectado, o sistema não salva fechamentos localmente se faltar a instalação do SQL.
