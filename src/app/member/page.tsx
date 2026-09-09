const cards = [
  ["Membership", "ACTIVE"],
  ["Community Support Plan", "NOT_REGISTERED"],
  ["Current Coordinator", "Available after sign-in"],
  ["Wallet", "₹0.00"],
  ["Pending dues", "0"],
  ["Expired dues", "0"],
  ["Recent payments", "No payments yet"],
  ["Nominee", "Set up your nominees"],
];
export default function MemberDashboard() {
  return (
    <main>
      <p className="eyebrow">MEMBER DASHBOARD</p>
      <h2>Welcome to your Community Support account</h2>
      <p>Keep your details, nominees, payments, and support plan information together.</p>
      <div className="grid">
        {cards.map(([label, value]) => (
          <article key={label}>
            <p>{label}</p>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <article>
        <h3>Important notifications</h3>
        <p>You will see membership, verification, payment, and Coordinator updates here.</p>
      </article>
    </main>
  );
}
