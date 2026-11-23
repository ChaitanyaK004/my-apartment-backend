async function testApprove() {
  const hosts = [
    { name: 'Local API', url: 'http://localhost:5001/api' },
    { name: 'Render Cloud API', url: 'https://my-apartment-backend.onrender.com/api' }
  ];

  for (const { name, url } of hosts) {
    console.log(`\n=== Testing ${name} (${url}) ===`);
    try {
      const loginRes = await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: 'admin', password: 'Admin@123' })
      });
      const loginData = await loginRes.json();
      console.log('Admin login status:', loginRes.status, 'role:', loginData.user?.role, 'hasToken:', !!loginData.token);

      if (!loginData.token) {
        console.error('Failed to get token:', loginData);
        continue;
      }

      // First GET /payments/PAY-1029 or find PAY-1029
      const getRes = await fetch(`${url}/payments`, {
        headers: { 'Authorization': `Bearer ${loginData.token}` }
      });
      const payments = await getRes.json();
      const p1029 = Array.isArray(payments) ? payments.find(p => p.id === 'PAY-1029') : null;
      console.log('PAY-1029 found in GET /payments?', !!p1029, p1029 ? { id: p1029.id, status: p1029.status, amount: p1029.amount } : null);

      // Now attempt PATCH /payments/PAY-1029/approve
      const approveRes = await fetch(`${url}/payments/PAY-1029/approve`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${loginData.token}`
        }
      });
      console.log('Approve HTTP status:', approveRes.status);
      const approveData = await approveRes.text();
      console.log('Approve response body:', approveData);
    } catch (err) {
      console.error(`Error on ${name}:`, err.message);
    }
  }
}

testApprove().catch(console.error);
