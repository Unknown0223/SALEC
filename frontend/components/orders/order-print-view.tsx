"use client";

type PrintOrderProps = {
  order: {
    id: number;
    number: string;
    status: string;
    total_sum: string;
    bonus_sum: string;
    comment: string | null;
    created_at: string;
    client_name: string;
    client_address: string | null;
    client_phone: string | null;
    client_inn: string | null;
    warehouse_name: string | null;
    agent_name: string | null;
  };
  items: Array<{
    id: number;
    sku: string;
    name: string;
    unit: string;
    qty: string;
    price: string;
    total: string;
    is_bonus: boolean;
  }>;
};

function fmt(n: string | number) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    new: "Yangi",
    confirmed: "Tasdiqlangan",
    picking: "Yig'ilmoqda",
    delivering: "Yetkazilmoqda",
    delivered: "Topshirilgan",
    cancelled: "Bekor qilingan"
  };
  return map[status] ?? status;
}

export function OrderPrintView({ order, items }: PrintOrderProps) {
  return (
    <div className="print-only" style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-only, .print-only * { visibility: visible; }
          .print-only { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
        @media screen {
          .print-only {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          }
        }
      `}</style>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "24px", borderBottom: "2px solid #333", paddingBottom: "16px" }}>
        <h1 style={{ margin: 0, fontSize: "20px", fontWeight: "bold" }}>INVOICE / ZAKAZ</h1>
        <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#666" }}>
          Raqam: <strong>{order.number}</strong> &nbsp;|&nbsp; Sana: <strong>{new Date(order.created_at).toLocaleDateString("uz-UZ")}</strong>
        </p>
        <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#888" }}>
          Holat: {statusLabel(order.status)}
        </p>
      </div>

      {/* Client & Details */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
        <div>
          <h3 style={{ margin: "0 0 8px", fontSize: "13px", color: "#666", textTransform: "uppercase" }}>Mijoz</h3>
          <p style={{ margin: 0, fontSize: "14px", fontWeight: "bold" }}>{order.client_name}</p>
          {order.client_address && <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#666" }}>{order.client_address}</p>}
          {order.client_phone && <p style={{ margin: "2px 0 0", fontSize: "12px" }}>Tel: {order.client_phone}</p>}
          {order.client_inn && <p style={{ margin: "2px 0 0", fontSize: "12px" }}>STIR: {order.client_inn}</p>}
        </div>
        <div>
          <h3 style={{ margin: "0 0 8px", fontSize: "13px", color: "#666", textTransform: "uppercase" }}>Tafsilotlar</h3>
          {order.warehouse_name && <p style={{ margin: 0, fontSize: "12px" }}>Ombor: {order.warehouse_name}</p>}
          {order.agent_name && <p style={{ margin: "2px 0 0", fontSize: "12px" }}>Agent: {order.agent_name}</p>}
          <p style={{ margin: "2px 0 0", fontSize: "12px" }}>Buyurtma ID: #{order.id}</p>
          {order.comment && <p style={{ margin: "2px 0 0", fontSize: "12px", fontStyle: "italic" }}>Izoh: {order.comment}</p>}
        </div>
      </div>

      {/* Items Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginBottom: "24px" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #333" }}>
            <th style={{ padding: "8px", textAlign: "left", fontWeight: "bold" }}>#</th>
            <th style={{ padding: "8px", textAlign: "left", fontWeight: "bold" }}>Kod</th>
            <th style={{ padding: "8px", textAlign: "left", fontWeight: "bold" }}>Mahsulot</th>
            <th style={{ padding: "8px", textAlign: "right", fontWeight: "bold" }}>Miqdor</th>
            <th style={{ padding: "8px", textAlign: "right", fontWeight: "bold" }}>Narx</th>
            <th style={{ padding: "8px", textAlign: "right", fontWeight: "bold" }}>Summa</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "6px 8px" }}>{i + 1}</td>
              <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{item.sku}</td>
              <td style={{ padding: "6px 8px" }}>
                {item.name}
                {item.is_bonus && (
                  <span style={{ marginLeft: "4px", padding: "1px 6px", background: "#fef3c7", borderRadius: "4px", fontSize: "10px" }}>
                    BONUS
                  </span>
                )}
              </td>
              <td style={{ padding: "6px 8px", textAlign: "right" }}>{parseFloat(item.qty).toFixed(3)} {item.unit}</td>
              <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmt(item.price)}</td>
              <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: "bold" }}>{fmt(item.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid #333" }}>
            <td colSpan={4} style={{ padding: "8px", textAlign: "right", fontWeight: "bold" }}>JAMI:</td>
            <td style={{ padding: "8px", textAlign: "right", fontWeight: "bold" }}>{items.length} ta mahsulot</td>
            <td style={{ padding: "8px", textAlign: "right", fontWeight: "bold", fontSize: "14px" }}>{fmt(order.total_sum)} so‘m</td>
          </tr>
          {parseFloat(order.bonus_sum) > 0 && (
            <tr>
              <td colSpan={5} style={{ padding: "4px 8px", textAlign: "right", color: "#666" }}>Bonus summasi:</td>
              <td style={{ padding: "4px 8px", textAlign: "right", color: "#666" }}>{fmt(order.bonus_sum)} so‘m</td>
            </tr>
          )}
        </tfoot>
      </table>

      {/* Footer */}
      <div style={{ marginTop: "40px", borderTop: "1px solid #ddd", paddingTop: "16px", fontSize: "11px", color: "#888", textAlign: "center" }}>
        <p style={{ margin: 0 }}>Ushbu hujjat elektron tarzda yaratilgan va imzolangan.</p>
        <p style={{ margin: "4px 0 0" }}>Chop etilgan sana: {new Date().toLocaleString("uz-UZ")}</p>
      </div>
    </div>
  );
}
