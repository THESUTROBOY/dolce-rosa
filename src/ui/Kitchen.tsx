import { useState } from "react";
import type { Comanda, ComandaStatus, Station } from "../domain/types";
import { STATION_LABEL } from "../domain/types";
import { comandaHtml, printHtml } from "../print";
import {
  canPrint,
  minutesSince,
  useAppState,
  useNow,
  useStore,
} from "../state";
import { Empty, Segmented } from "./kit";

const NEXT: Record<ComandaStatus, { to: ComandaStatus; label: string } | null> =
  {
    pendiente: { to: "preparando", label: "Empezar" },
    preparando: { to: "listo", label: "Marcar listo" },
    listo: { to: "entregado", label: "Entregado" },
    entregado: null,
  };

export function Kitchen() {
  const state = useAppState();
  const store = useStore();
  const now = useNow(15000);
  const [station, setStation] = useState<Station>(() => {
    try {
      return (
        (localStorage.getItem("dolce-rosa:station") as Station) || "cocina"
      );
    } catch {
      return "cocina";
    }
  });
  const pick = (s: Station) => {
    setStation(s);
    try {
      localStorage.setItem("dolce-rosa:station", s);
    } catch {
      /* nada */
    }
  };

  const mine = state.comandas.filter((c) => c.station === station);
  const active = mine
    .filter((c) => c.status === "pendiente" || c.status === "preparando")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const ready = mine
    .filter((c) => c.status === "listo")
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const done = mine
    .filter(
      (c) =>
        c.status === "entregado" &&
        now - new Date(c.updatedAt).getTime() < 60 * 60000,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);
  const count = (s: Station) =>
    state.comandas.filter(
      (c) =>
        c.station === s &&
        (c.status === "pendiente" || c.status === "preparando"),
    ).length;

  const Ticket = ({ c, pos }: { c: Comanda; pos: number }) => {
    const mins = minutesSince(c.createdAt, now);
    const next = NEXT[c.status];
    return (
      <div className="tk-hang">
        <article
          className={`ticket tk-${c.status}`}
          aria-label={`Comanda ${c.number}, ${c.tableName}`}
        >
          <span className="tk-clip" aria-hidden />
          <header>
            <span className="tk-pos" aria-hidden>
              {pos}
            </span>
            <strong className="tk-table">{c.tableName}</strong>
            <span
              className={`tk-time ${mins >= 20 ? "late" : mins >= 10 ? "slow" : ""}`}
            >
              {mins < 1 ? "recién" : `${mins} min`}
            </span>
          </header>
          <span className="tk-num">
            #{c.number} ·{" "}
            {new Date(c.createdAt).toLocaleTimeString("es-CL", {
              timeStyle: "short",
            })}
            {c.status === "preparando" && (
              <b className="tk-state"> · Preparando</b>
            )}
            {c.status === "listo" && <b className="tk-state"> · Listo</b>}
          </span>
          <ul>
            {c.items.map((i, k) => (
              <li key={k}>
                <span className="tk-qty">{i.qty}</span>
                <div>
                  <strong>
                    {i.name}
                    {i.variant ? ` · ${i.variant}` : ""}
                  </strong>
                  {i.extras.length > 0 && (
                    <span className="tk-extra">+ {i.extras.join(", ")}</span>
                  )}
                  {i.note && <span className="tk-note">{i.note}</span>}
                </div>
              </li>
            ))}
          </ul>
          <footer>
            {next && (
              <button
                className={`tk-go ${c.status === "preparando" ? "btn-ok" : "btn-primary"}`}
                onClick={() => {
                  store.setComandaStatus(c.id, next.to);
                  navigator.vibrate?.(10);
                }}
              >
                {next.label}
              </button>
            )}
            <div className="tk-minor">
              {c.status !== "pendiente" && (
                <button
                  className="btn-plain small"
                  onClick={() =>
                    store.setComandaStatus(
                      c.id,
                      c.status === "preparando"
                        ? "pendiente"
                        : c.status === "listo"
                          ? "preparando"
                          : "listo",
                    )
                  }
                >
                  Deshacer
                </button>
              )}
              {canPrint && (
                <button
                  className="btn-plain small"
                  onClick={() => printHtml(comandaHtml(c))}
                >
                  Imprimir
                </button>
              )}
            </div>
          </footer>
        </article>
      </div>
    );
  };

  const onRail = [...active, ...ready];

  return (
    <div className="screen screen-kitchen">
      <header className="k-head">
        <div>
          <h1>{STATION_LABEL[station]}</h1>
          <p className="subtitle">
            {active.length === 0
              ? "Nada pendiente"
              : `${active.length} ${active.length === 1 ? "comanda por preparar" : "comandas por preparar"}`}
            {ready.length > 0 &&
              ` · ${ready.length} ${ready.length === 1 ? "lista" : "listas"} para servir`}
          </p>
        </div>
        <Segmented<Station>
          label="Estación"
          value={station}
          onChange={pick}
          options={[
            {
              value: "cocina",
              label: `Cocina${count("cocina") ? ` · ${count("cocina")}` : ""}`,
            },
            {
              value: "barra",
              label: `Cafetería${count("barra") ? ` · ${count("barra")}` : ""}`,
            },
          ]}
        />
      </header>

      <section className="rail-wrap" aria-label="Comandas en orden de llegada">
        <div className="rail-bar" aria-hidden />
        {onRail.length === 0 ? (
          <Empty title="Todo al día">
            Las comandas nuevas se cuelgan aquí apenas el mesero envía el
            pedido.
          </Empty>
        ) : (
          <div className="rail">
            {onRail.map((c, i) => (
              <Ticket key={c.id} c={c} pos={i + 1} />
            ))}
          </div>
        )}
      </section>
      {done.length > 0 && (
        <section className="k-section">
          <h2 className="group-title">Entregados en la última hora</h2>
          <ul className="list">
            {done.map((c) => (
              <li key={c.id} className="done-row">
                <span>
                  <strong>{c.tableName}</strong> · #{c.number} ·{" "}
                  {c.items.reduce((s, i) => s + i.qty, 0)}{" "}
                  {c.items.reduce((s, i) => s + i.qty, 0) === 1
                    ? "producto"
                    : "productos"}
                </span>
                <button
                  className="btn-plain small"
                  onClick={() => store.setComandaStatus(c.id, "listo")}
                >
                  Deshacer
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
