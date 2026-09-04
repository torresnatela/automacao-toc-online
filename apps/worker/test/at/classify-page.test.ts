import { describe, it, expect } from "vitest";
import { classifyAtPage, fingerprint, type AtPageSnapshot } from "../../src/at/classify-page";

const PORTAL = "https://iva.portaldasfinancas.gov.pt/dpiva/portal/cc/consultar-declaracao";
const LOGIN = "https://www.acesso.gov.pt/v2/loginForm?partID=DPIV";

function snap(over: Partial<AtPageSnapshot> = {}): AtPageSnapshot {
  return { url: PORTAL, title: "Portal das Finanças", text: "", forms: [], ...over };
}

/** O formulário de autenticação tal como aparece: utilizador + senha. */
function loginForms(): AtPageSnapshot["forms"] {
  return [
    {
      fields: [
        { name: "username", type: "text" },
        { name: "password", type: "password" },
      ],
    },
  ];
}

describe("classifyAtPage — autenticação", () => {
  it("um formulário de login nu é login_form, nunca login_rejected", () => {
    // A armadilha: as palavras "Utilizador" e "Senha" são rótulos do próprio
    // formulário. Sem uma frase que AFIRME a recusa, não houve recusa — e
    // classificar mal aqui marcaria uma credencial boa como inválida.
    const kind = classifyAtPage(
      snap({
        url: LOGIN,
        title: "Autenticação.Gov",
        text: "Autenticação\nNIF\nUtilizador\nSenha\nAutenticar\nRecuperar senha",
        forms: loginForms(),
      }),
    );
    expect(kind).toEqual({ kind: "login_form" });
  });

  it("reconhece a recusa e o número de tentativas que restam", () => {
    const kind = classifyAtPage(
      snap({
        url: LOGIN,
        text: "Erro na tentativa de autenticação. Tem mais 2 tentativas antes do bloqueio.",
        forms: loginForms(),
      }),
    );
    expect(kind).toEqual({ kind: "login_rejected", attemptsLeft: 2 });
  });

  it("aceita a recusa sem contador (attemptsLeft nulo)", () => {
    const kind = classifyAtPage(
      snap({ url: LOGIN, text: "Erro na tentativa de autenticação.", forms: loginForms() }),
    );
    expect(kind).toEqual({ kind: "login_rejected", attemptsLeft: null });
  });

  it("o bloqueio vence a recusa: é o desfecho mais grave dos dois", () => {
    const kind = classifyAtPage(
      snap({
        url: LOGIN,
        text: "Erro na tentativa de autenticação. A sua senha encontra-se bloqueada.",
        forms: loginForms(),
      }),
    );
    expect(kind).toEqual({ kind: "password_blocked" });
  });

  it("reconhece o desafio de segundo fator", () => {
    const kind = classifyAtPage(
      snap({
        url: LOGIN,
        text: "Introduza o código de segurança que lhe foi enviado.",
        forms: loginForms(),
      }),
    );
    expect(kind).toEqual({ kind: "mfa_challenge" });
  });

  it("aceita as outras formas de pedir o segundo fator", () => {
    for (const text of [
      "Introduza o código de segurança enviado por SMS",
      "O código de verificação foi enviado para o seu e-mail.",
      "A autenticação em dois passos é obrigatória nesta conta.",
    ]) {
      expect(classifyAtPage(snap({ url: LOGIN, text, forms: loginForms() }))).toEqual({
        kind: "mfa_challenge",
      });
    }
  });

  it("reconhece a mudança de senha quando ela é imposta", () => {
    for (const text of [
      "Tem de alterar a sua palavra-passe antes de continuar.",
      "A sua senha expirou. Deve alterar a senha para continuar.",
      "A sua palavra-passe caducou.",
    ]) {
      expect(classifyAtPage(snap({ url: LOGIN, text, forms: loginForms() }))).toEqual({
        kind: "password_change",
      });
    }
  });

  it("os rótulos e links do próprio formulário não classificam nada", () => {
    // Cada um destes desfechos dá `AtAuthError` e marca a credencial — a partir
    // daí todos os jobs da equipa morrem na pré-condição. Um link no rodapé, um
    // botão de método alternativo ou o rótulo de um captcha não podem ter esse
    // poder: sem uma frase que AFIRME o pedido, é um formulário e mais nada.
    for (const text of [
      "Autenticação\nUtilizador\nSenha\nEntrar\nAlterar palavra-passe",
      "Autenticação\nUtilizador\nSenha\nEntrar\nRecuperar senha",
      "Autenticação\nUtilizador\nSenha\nCódigo de segurança\nEntrar",
      "Autenticar com Chave Móvel Digital",
      "Definir nova palavra-passe",
    ]) {
      expect(classifyAtPage(snap({ url: LOGIN, text, forms: loginForms() }))).toEqual({
        kind: "login_form",
      });
    }
  });

  it("um campo de senha no host do portal também cai no ramo de autenticação", () => {
    // Sessão expirada: a AT devolve o formulário no próprio domínio do portal.
    const kind = classifyAtPage(snap({ text: "Autenticação", forms: loginForms() }));
    expect(kind).toEqual({ kind: "login_form" });
  });
});

describe("classifyAtPage — portal", () => {
  it("reconhece a falta de autorização sobre o contribuinte", () => {
    const kind = classifyAtPage(
      snap({ text: "Não tem autorização para consultar os dados deste contribuinte." }),
    );
    expect(kind).toEqual({ kind: "authorization_missing" });
  });

  it("reconhece o ecrã de seleção de cliente pelo campo do NIF", () => {
    const kind = classifyAtPage(
      snap({
        title: "Lista de clientes",
        text: "Indique o NIF do sujeito passivo a representar.",
        forms: [{ fields: [{ name: "nif", type: "text" }] }],
      }),
    );
    expect(kind).toEqual({ kind: "client_select" });
  });

  it("um campo nif escondido na guia não a transforma em escolha de cliente", () => {
    // O ecrã da guia traz um `nif` escondido para o submit seguinte. Se a regra
    // estrutural corresse antes das de conteúdo, a página era dada por seleção
    // de cliente e o PDF nunca chegava a ser capturado.
    const kind = classifyAtPage(
      snap({
        title: "Documento de pagamento",
        text: "Documento de pagamento\nEntidade: 10800\nReferência: 123 456 789 012 345",
        forms: [
          {
            fields: [
              { name: "nif", type: "hidden" },
              { name: "ano", type: "select" },
            ],
          },
        ],
      }),
    );
    expect(kind).toEqual({ kind: "payment_document" });
  });

  it("o rodapé «se já pagou este documento» não dá a guia por paga", () => {
    // `pag[ao]` sem `\b` casa dentro de "pagou": era o rodapé da própria guia a
    // impedir a captura do PDF que estava mesmo ali.
    const kind = classifyAtPage(
      snap({
        text: "Documento de pagamento\nEntidade: 10800\nSe já pagou este documento, ignore este aviso.",
      }),
    );
    expect(kind).toEqual({ kind: "payment_document" });
  });

  it("reconhece a lista de declarações", () => {
    const kind = classifyAtPage(
      snap({
        title: "Consultar declaração",
        text: "Declarações periódicas de IVA\nPeríodo\tData\tTipo\n2026-07\t2026-09-10\tPrimeira",
      }),
    );
    expect(kind).toEqual({ kind: "declaration_list" });
  });

  it("reconhece a ausência de declarações", () => {
    const kind = classifyAtPage(
      snap({ text: "Não existem declarações para os critérios indicados." }),
    );
    expect(kind).toEqual({ kind: "declaration_none" });
  });

  it("reconhece o documento de pagamento", () => {
    const kind = classifyAtPage(
      snap({
        title: "Documento de pagamento",
        text: "Documento de pagamento\nEntidade: 10800\nReferência: 123 456 789 012 345\nValor: 1.234,56 €",
      }),
    );
    expect(kind).toEqual({ kind: "payment_document" });
  });

  it("distingue não haver documento de haver e já estar pago", () => {
    expect(
      classifyAtPage(snap({ text: "Não existe documento de pagamento para o período indicado." })),
    ).toEqual({ kind: "payment_document_none" });
    expect(classifyAtPage(snap({ text: "Não há lugar a pagamento neste período." }))).toEqual({
      kind: "payment_document_none",
    });
    expect(classifyAtPage(snap({ text: "A declaração já foi paga em 2026-09-05." }))).toEqual({
      kind: "already_paid",
    });
    expect(classifyAtPage(snap({ text: "IVA já pago." }))).toEqual({ kind: "already_paid" });
    expect(classifyAtPage(snap({ text: "Pagamento já efetuado." }))).toEqual({
      kind: "already_paid",
    });
  });

  it("reconhece a declaração ainda em processamento", () => {
    expect(classifyAtPage(snap({ text: "A declaração encontra-se em validação." }))).toEqual({
      kind: "not_ready",
    });
  });

  it("não arrisca palpites: página irreconhecível é unknown", () => {
    expect(classifyAtPage(snap({ text: "Bem-vindo à sua área reservada." }))).toEqual({
      kind: "unknown",
    });
  });
});

describe("classifyAtPage — precedência", () => {
  it("manutenção no host do portal vence a leitura da página", () => {
    const kind = classifyAtPage(
      snap({
        text: "O portal encontra-se em manutenção.\nDeclarações periódicas\nPeríodo\tData",
      }),
    );
    expect(kind).toEqual({ kind: "maintenance" });
  });

  it("um 503 é erro de servidor mesmo com redação de manutenção", () => {
    const kind = classifyAtPage(snap({ status: 503, text: "O portal encontra-se em manutenção." }));
    expect(kind).toEqual({ kind: "server_error" });
  });

  it("um 500 vence até o formulário de login", () => {
    const kind = classifyAtPage(
      snap({ url: LOGIN, status: 500, text: "Utilizador\nSenha", forms: loginForms() }),
    );
    expect(kind).toEqual({ kind: "server_error" });
  });

  it("reconhece o erro de servidor pela redação, sem status", () => {
    expect(classifyAtPage(snap({ text: "Ocorreu um erro interno do servidor." }))).toEqual({
      kind: "server_error",
    });
  });

  it("aceita padrões de host injetados, para o teste apontar a um servidor local", () => {
    const kind = classifyAtPage(
      snap({ url: "http://127.0.0.1:1234/loginForm", text: "Utilizador\nSenha", forms: [] }),
      { loginHostPattern: /^127\.0\.0\.1:\d+$/ },
    );
    expect(kind).toEqual({ kind: "login_form" });
  });

  it("uma URL ilegível não faz o classificador rebentar", () => {
    expect(classifyAtPage(snap({ url: "nem é uma url", text: "" })).kind).toBe("unknown");
  });
});

describe("fingerprint", () => {
  const sujo = snap({
    url: "https://iva.portaldasfinancas.gov.pt/dpiva/portal/cc/obter-doc-pagamento?nif=501234567&periodo=2026-07",
    title: "Documento de pagamento 2026-07 — 501234567",
    text: [
      "Contribuinte 501234567 — SOCIEDADE EXEMPLO LDA, com sede na Rua Muito Muito Muito Comprida",
      "Entidade: 10800",
      "Referência: 123 456 789 012 345",
      "Valor: 1.234,56 €",
      "Data limite de pagamento: 2026-09-15",
      "Linha que não deve entrar no fingerprint: 987654321",
    ].join("\n"),
    forms: [
      {
        fields: [
          { name: "nif", type: "text" },
          { name: "password", type: "password" },
        ],
      },
    ],
  });

  it("não deixa passar nem dígitos nem query string", () => {
    const serialized = JSON.stringify(fingerprint(sujo));
    expect(serialized).not.toMatch(/\d{3}/);
    expect(serialized).not.toContain("?");
    expect(serialized).not.toContain("501234567");
  });

  it("guarda o host, os campos e as bandeiras que permitem reconhecer a página", () => {
    const fp = fingerprint(sujo);
    expect(fp.host).toBe("iva.portaldasfinancas.gov.pt");
    expect(fp.fields).toEqual(["nif:text", "password:password"]);
    expect(fp.hasPasswordField).toBe(true);
    expect(fp.hasNifField).toBe(true);
    // Só os dígitos desaparecem; a pontuação fica, e é ela que ainda deixa
    // reconhecer a forma do título quando a AT o mudar.
    expect(fp.title).toBe("Documento de pagamento #-# — #");
  });

  it("corta em cinco linhas e sessenta caracteres", () => {
    const lines = fingerprint(sujo).text as string[];
    expect(lines).toHaveLength(5);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(60);
    expect(lines.join(" ")).not.toContain("987654321");
  });

  it("aguenta uma URL ilegível sem lançar", () => {
    expect(fingerprint(snap({ url: "nem é uma url" })).host).toBe(null);
  });
});
