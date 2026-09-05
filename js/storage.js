(function () {
  const cfg = window.APP_CONFIG;
  const hasCloud = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  const client = hasCloud ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  const productKey = 'snoop_products_v1';
  const orderKey = 'snoop_orders_v1';
  const expenseKey = 'snoop_expenses_v1';
  const categoryKey = 'snoop_categories_v1';
  const adminSessionKey = 'snoop_admin_session_v1';
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function localProducts() {
    const stored = localStorage.getItem(productKey);
    if (!stored) {
      localStorage.setItem(productKey, JSON.stringify(window.DEFAULT_PRODUCTS));
      return clone(window.DEFAULT_PRODUCTS);
    }
    return JSON.parse(stored);
  }

  function localExpenses() {
    return JSON.parse(localStorage.getItem(expenseKey) || '[]');
  }

  function localCategories() {
    const stored = localStorage.getItem(categoryKey);
    if (stored) return JSON.parse(stored);
    const categories = [...new Set(localProducts().map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    localStorage.setItem(categoryKey, JSON.stringify(categories));
    return categories;
  }

  function saveLocalExpense(expense) {
    const saved = { ...expense, id: expense.id || crypto.randomUUID(), createdAt: expense.createdAt || new Date().toISOString() };
    const expenses = localExpenses();
    expenses.unshift(saved);
    localStorage.setItem(expenseKey, JSON.stringify(expenses));
    return saved;
  }

  function expenseTableMissing(error) {
    return ['42P01', 'PGRST204', 'PGRST205'].includes(error?.code);
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      reader.readAsDataURL(file);
    });
  }

  window.StoreAPI = {
    mode: hasCloud ? 'cloud' : 'local',
    client,
    async getProducts(includeUnavailable = false) {
      if (!hasCloud) return localProducts().filter((p) => includeUnavailable || p.available);
      let query = client.from('products').select('*').order('created_at');
      if (!includeUnavailable) query = query.eq('available', true);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    async saveProduct(product) {
      if (!hasCloud) {
        const products = localProducts();
        const index = products.findIndex((p) => p.id === product.id);
        if (index >= 0) products[index] = product; else products.push(product);
        localStorage.setItem(productKey, JSON.stringify(products));
        return product;
      }
      const { data, error } = await client.from('products').upsert(product).select().single();
      if (error) throw error;
      return data;
    },
    async deleteProduct(id) {
      if (!hasCloud) {
        localStorage.setItem(productKey, JSON.stringify(localProducts().filter((p) => p.id !== id)));
        return;
      }
      const { error } = await client.from('products').delete().eq('id', id);
      if (error) throw error;
    },
    async getCategories() {
      if (!hasCloud) return localCategories();
      const { data, error } = await client.from('product_categories').select('name').order('name');
      if (error) {
        if (expenseTableMissing(error)) return localCategories();
        throw error;
      }
      return data.map((category) => category.name);
    },
    async createCategory(name) {
      if (!hasCloud) {
        const categories = [...new Set([...localCategories(), name])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        localStorage.setItem(categoryKey, JSON.stringify(categories));
        return name;
      }
      const { error } = await client.from('product_categories').insert({ name });
      if (error) {
        if (expenseTableMissing(error)) {
          const categories = [...new Set([...localCategories(), name])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
          localStorage.setItem(categoryKey, JSON.stringify(categories));
          return name;
        }
        throw error;
      }
      return name;
    },
    async deleteCategory(name) {
      if (!hasCloud) {
        localStorage.setItem(categoryKey, JSON.stringify(localCategories().filter((category) => category !== name)));
        return;
      }
      const { error } = await client.from('product_categories').delete().eq('name', name);
      if (error) {
        if (expenseTableMissing(error)) {
          localStorage.setItem(categoryKey, JSON.stringify(localCategories().filter((category) => category !== name)));
          return;
        }
        throw error;
      }
    },
    async uploadProductImage(file) {
      if (!hasCloud) return fileToDataUrl(file);
      const rawExtension = file.name.split('.').pop() || 'webp';
      const extension = rawExtension.toLowerCase().replace(/[^a-z0-9]/g, '') || 'webp';
      const path = `products/${Date.now()}-${crypto.randomUUID()}.${extension}`;
      const { error } = await client.storage.from('product-images').upload(path, file, { cacheControl: '31536000', contentType: file.type, upsert: false });
      if (error) throw error;
      const { data } = client.storage.from('product-images').getPublicUrl(path);
      if (!data?.publicUrl) throw new Error('Não foi possível gerar o endereço público da imagem.');
      return data.publicUrl;
    },
    async createOrder(payload) {
      if (!hasCloud) {
        const products = localProducts();
        const items = payload.items.map((item) => {
          const product = products.find((p) => p.id === item.productId && p.available);
          if (!product) throw new Error('Um produto do carrinho não está mais disponível.');
          return { productId: product.id, name: product.name, quantity: item.quantity, unitPrice: product.price, subtotal: product.price * item.quantity };
        });
        const trustedTotal = items.reduce((sum, item) => sum + item.subtotal, 0);
        const order = { ...payload, id: crypto.randomUUID(), code: `SN${Date.now().toString().slice(-6)}`, items, trustedTotal, clientTotal: payload.clientTotal, status: 'pending', createdAt: new Date().toISOString() };
        const orders = JSON.parse(localStorage.getItem(orderKey) || '[]');
        orders.unshift(order);
        localStorage.setItem(orderKey, JSON.stringify(orders));
        return order;
      }
      const { data, error } = await client.rpc('create_order', { order_payload: payload });
      if (error) throw error;
      return data;
    },
    async getOrders() {
      if (!hasCloud) return JSON.parse(localStorage.getItem(orderKey) || '[]');
      const { data, error } = await client.from('orders_with_items').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data.map((o) => ({
        ...o,
        customerName: o.customer_name,
        deliveryType: o.delivery_type,
        trustedTotal: Number(o.trusted_total),
        clientTotal: Number(o.client_total),
        createdAt: o.created_at
      }));
    },
    async updateOrderStatus(id, status) {
      if (!hasCloud) {
        const orders = JSON.parse(localStorage.getItem(orderKey) || '[]').map((o) => o.id === id ? { ...o, status } : o);
        localStorage.setItem(orderKey, JSON.stringify(orders));
        return;
      }
      const { error } = await client.from('orders').update({ status }).eq('id', id);
      if (error) throw error;
    },
    async getExpenses() {
      if (!hasCloud) return localExpenses();
      const { data, error } = await client.from('expenses').select('*').order('spent_at', { ascending: false });
      if (error) {
        if (expenseTableMissing(error)) return localExpenses();
        throw error;
      }
      return data.map((expense) => ({
        ...expense,
        amount: Number(expense.amount),
        spentBy: expense.spent_by,
        spentAt: expense.spent_at,
        createdAt: expense.created_at
      }));
    },
    async createExpense(expense) {
      if (!hasCloud) return saveLocalExpense(expense);
      const { data, error } = await client.from('expenses').insert({ description: expense.description, amount: expense.amount, spent_by: expense.spentBy, spent_at: expense.spentAt }).select().single();
      if (error) {
        if (expenseTableMissing(error)) return saveLocalExpense(expense);
        throw error;
      }
      return { ...data, amount: Number(data.amount), spentBy: data.spent_by, spentAt: data.spent_at, createdAt: data.created_at };
    },
    async deleteExpense(id) {
      if (!hasCloud) {
        localStorage.setItem(expenseKey, JSON.stringify(localExpenses().filter((expense) => expense.id !== id)));
        return;
      }
      const { error } = await client.from('expenses').delete().eq('id', id);
      if (error) {
        if (expenseTableMissing(error)) {
          localStorage.setItem(expenseKey, JSON.stringify(localExpenses().filter((expense) => expense.id !== id)));
          return;
        }
        throw error;
      }
    },
    async verifyAdminPassword(password) {
      if (!hasCloud) return password === cfg.demoAdminPin;
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      const email = userData?.user?.email;
      if (!email) throw new Error('Não foi possível identificar o administrador conectado.');
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (!error) return true;
      if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(error.message || '')) return false;
      throw error;
    },
    async resetOperationalData() {
      if (!hasCloud) {
        const result = {
          orders: JSON.parse(localStorage.getItem(orderKey) || '[]').length,
          expenses: localExpenses().length
        };
        localStorage.setItem(orderKey, '[]');
        localStorage.setItem(expenseKey, '[]');
        return result;
      }
      const { data, error } = await client.rpc('reset_operational_data');
      if (error) {
        if (['PGRST202', '42883'].includes(error.code)) {
          throw new Error('Execute o arquivo supabase/05-controle-geral.sql no SQL Editor do Supabase antes de usar o reset.');
        }
        throw error;
      }
      return data;
    },
    async login(email, password) {
      if (!hasCloud) {
        const authenticated = password === cfg.demoAdminPin;
        if (authenticated) sessionStorage.setItem(adminSessionKey, 'authenticated');
        return authenticated;
      }
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return true;
    },
    async isAuthenticated() {
      if (!hasCloud) return sessionStorage.getItem(adminSessionKey) === 'authenticated';
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return Boolean(data.session);
    },
    async logout() {
      if (!hasCloud) {
        sessionStorage.removeItem(adminSessionKey);
        return;
      }
      await client.auth.signOut();
    }
  };
})();
