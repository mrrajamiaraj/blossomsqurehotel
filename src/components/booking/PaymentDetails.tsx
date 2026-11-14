import { PAYMENT_METHODS } from "@/lib/hotel";
import CopyButton from "../ui/CopyButton";
import styles from "./PaymentDetails.module.css";

/** bKash / Nagad / bank details for sending an advance, with copy buttons. */
export default function PaymentDetails({ reference }: { reference?: string }) {
  return (
    <div className={styles.wrap}>
      <ul role="list" className={styles.list}>
        {PAYMENT_METHODS.map((m) => (
          <li key={m.id} className={styles.method}>
            <p className={styles.name}>{m.name}</p>
            <p className={styles.note}>{m.note}</p>
            <dl className={styles.fields}>
              {m.fields.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>
                    <span className={styles.value}>{f.value}</span>
                    <CopyButton text={f.copy} label={f.label} className={styles.copy} />
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <p className={styles.foot}>
        {reference ? (
          <>
            Use <strong>{reference}</strong> as the payment reference
          </>
        ) : (
          "Use your booking reference as the payment reference"
        )}
        , then send us the transaction ID on WhatsApp or by phone so we can confirm it.
      </p>
    </div>
  );
}
