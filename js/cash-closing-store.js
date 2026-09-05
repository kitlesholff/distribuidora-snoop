(function () {
  'use strict';
  const key = 'snoop_cash_closings_v1';
  const core = window.CashClosingCore;
  const store = window.StoreAPI;
  const localRows = () => JSON.parse(localStorage.getItem(key) || '[]');
  const latestLocal = date => localRows().filter(r => r.closing_date === date).sort((a, b) => b.revision - a.revision)[0] || null;
  const localSnapshot = date => core.snapshot(date,
    JSON.parse(localStorage.getItem('snoop_orders_v1') || '[]'),
    JSON.parse(localStorage.getItem('snoop_expenses_v1') || '[]'));
  function check(error) {
    if (!error) return;
    if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code)) {
      throw new Error('Ative o fechamento: execute o arquivo supabase/06-fechamento-caixa.sql no SQL Editor do Supabase e clique em Atualizar conferência.');
    }
    if (error.code === '55P03') throw new Error('O caixa está recebendo alterações. Aguarde um instante e atualize a conferência.');
    throw error;
  }
  async function authenticated() {
    if (!await store.isAuthenticated()) throw new Error('Entre no painel para acessar os fechamentos.');
  }
  window.CashClosingStore = {
    async preview(date) {
      await authenticated();
      if (store.mode === 'local') return { snapshot: localSnapshot(date), latest: latestLocal(date) };
      const [preview, latest] = await Promise.all([
        store.client.rpc('cash_closing_preview', { p_date: date }),
        store.client.from('cash_closings').select('*').eq('closing_date', date).order('revision', { ascending: false }).limit(1)
      ]);
      check(preview.error); check(latest.error);
      return { snapshot: preview.data, latest: latest.data[0] || null };
    },
    async history(month) {
      await authenticated();
      if (!/^\d{4}-\d{2}$/.test(month) || !core.validDay(`${month}-01`)) throw new Error('Selecione um mês válido.');
      if (store.mode === 'local') return localRows().filter(r => r.closing_date.startsWith(month)).sort((a, b) => b.closing_date.localeCompare(a.closing_date) || b.revision - a.revision);
      const [year, monthNumber] = month.split('-').map(Number);
      const next = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
      const rows = [];
      // Paginação explícita para não cortar meses com muitas revisões.
      for (let offset = 0; ; offset += 100) {
        const result = await store.client.from('cash_closings')
          .select('id,closing_date,revision,responsible,expected_cash,counted_cash,difference,created_at')
          .gte('closing_date', `${month}-01`).lt('closing_date', next)
          .order('closing_date', { ascending: false }).order('revision', { ascending: false }).range(offset, offset + 99);
        check(result.error); rows.push(...result.data);
        if (result.data.length < 100) return rows;
      }
    },
    async get(id) {
      await authenticated();
      if (store.mode === 'local') {
        const row = localRows().find(r => r.id === id);
        if (!row) throw new Error('Fechamento não encontrado.');
        return row;
      }
      const result = await store.client.from('cash_closings').select('*').eq('id', id).single();
      check(result.error); return result.data;
    },
    async save(date, fields, fingerprint, revision) {
      await authenticated();
      if (store.mode === 'local') {
        const save = () => {
          const fresh = localSnapshot(date), latest = latestLocal(date);
          if ((latest?.revision || 0) !== revision) throw new Error('Outro fechamento foi salvo. Atualize a conferência.');
          if (fresh.fingerprint !== fingerprint) throw new Error('Os pedidos ou as saídas mudaram. Atualize e confira os valores novamente.');
          const values = core.reconcile(fresh.summary, fields, revision);
          const row = { id: crypto.randomUUID(), closing_date: date, revision: revision + 1,
            ...values, snapshot: fresh, created_at: new Date().toISOString(), created_by: 'local' };
          localStorage.setItem(key, JSON.stringify([row, ...localRows()]));
          return row;
        };
        return navigator.locks ? navigator.locks.request('snoop-cash-closing', save) : save();
      }
      const result = await store.client.rpc('save_cash_closing', {
        p_date: date, p_opening_cash: Number(fields.opening_cash), p_cash_expenses: Number(fields.cash_expenses),
        p_counted_cash: Number(fields.counted_cash), p_responsible: fields.responsible.trim(), p_notes: fields.notes.trim(),
        p_fingerprint: fingerprint, p_revision: revision
      });
      check(result.error); return result.data;
    }
  };
})();
