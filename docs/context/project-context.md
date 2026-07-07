# Contexto do Projeto — Automação de Guias Fiscais (TOConline)

> Documento de **contexto geral** do projeto. Descreve o domínio, os atores, o
> processo atual, o objetivo do sistema e as regras/restrições conhecidas.
> **Não contém plano de tarefas, cronograma ou etapas de execução** — serve para
> que uma pessoa (ou o Claude Code) compreenda o problema antes de decidir _como_
> resolvê-lo.

---

## 1. Resumo executivo

A **Elevate One** foi contratada por um **gabinete de contabilidade português**
(empresa "Ivecinha Cristina Carneiro") para automatizar o ciclo mensal de
extração e envio de **guias de pagamento de impostos e contribuições** aos
clientes do gabinete.

Hoje esse trabalho é feito manualmente, cliente a cliente, dentro da plataforma
**TOConline**. O objetivo é construir um sistema que replique esse trabalho de
forma automática — buscar cada guia nos portais oficiais, entregá-la ao cliente
correto e acompanhar o estado de cada obrigação — com um **painel de gestão** por
cima para supervisão e intervenção manual quando necessário.

Na sua essência, este é um projeto de **automação de browser (RPA)** sobre
sistemas web que **não oferecem API pública** para o que precisamos, acoplado a
uma camada de **orquestração, persistência de estado e entrega**.

---

## 2. Atores e stakeholders

**Lado do cliente (o gabinete de contabilidade):**

- **Ivo Cunha (sénior)** — proprietário/responsável pela empresa. É quem autoriza
  e concede o acesso ao TOConline. Único que pode liberar credenciais.
- **"Zé" / José (Ivo Cunha júnior)** — filho, é quem executa hoje o processo
  manual e conhece cada fluxo na plataforma. Será o ponto de contato técnico do
  lado do cliente ao longo do projeto (tira dúvidas sobre os caminhos dentro dos
  portais).

**Lado da execução (a Elevate One):**

- **Rodrigo Medalha** — conduz o relacionamento e define a visão do produto.
- Equipe de desenvolvimento: um responsável técnico ("Ivo" da Elevate One — nome
  coincide com o do cliente) mais desenvolvedores adicionais.

**Sistemas de terceiros envolvidos:**

- **TOConline** — plataforma central onde o gabinete opera.
- **Portais do Estado português** acessados a partir do TOConline: **Autoridade
  Tributária (AT / Portal das Finanças)**, **e-Fatura** e **Segurança Social
  Direta**.

---

## 3. A plataforma TOConline

O **TOConline** é a plataforma cloud de contabilidade, faturação e gestão da
**Ordem dos Contabilistas Certificados (OCC)** de Portugal. É uma das ferramentas
de referência para gabinetes que gerem múltiplos clientes, com forte integração
às obrigações fiscais portuguesas (SAF-T, e-Fatura, comunicação à AT).

Duas capacidades do TOConline são centrais para este projeto:

- **Execução multiempresa** — uma visão onde aparecem todos os clientes do
  gabinete de uma vez, permitindo operar tarefas em lote (por exemplo, submeter a
  DMR de todos os clientes simultaneamente).
- **"Acesso Direto"** — um atalho que abre a sessão do cliente diretamente nos
  portais das Finanças, e-Fatura e Segurança Social **sem digitar credenciais a
  cada vez**. Como a autenticação de dois fatores (2FA) é obrigatória na
  Segurança Social, o gabinete mantém um **utilizador dedicado por cliente**
  (em vez de depender da senha pessoal do cliente e do código que chegaria ao
  telemóvel dele).

O TOConline **não expõe uma API pública** para extração das guias da forma como o
projeto exige. Portanto, a automação passa por **navegar a interface web** do
TOConline e, através do "Acesso Direto", os portais do Estado.

---

## 4. O processo atual (como o gabinete trabalha hoje)

Todo o trabalho gira em torno do **ciclo mensal** de obrigações fiscais dos
clientes. É útil separar o que **já é automático** do que ainda é **manual**,
porque é essa fronteira que define o valor do projeto.

### 4.1. O que já é automático (em lote, dentro do TOConline)

Por volta do **dia 10 de cada mês**, o "Zé" entra na execução multiempresa,
seleciona todos os clientes e **submete em lote**:

- a comunicação de ordenados / **DMR (Declaração Mensal de Remunerações)** à
  **Autoridade Tributária** e à **Segurança Social**;
- e, mais tarde (por volta do dia 17–18), a guia da retenção na fonte de IRS.

Essa parte já funciona bem e **não consome tempo relevante** do gabinete.

### 4.2. O gargalo (manual, cliente a cliente)

O trabalho pesado é **ir buscar as guias de pagamento** de cada obrigação, para
cada cliente, e **enviá-las ao cliente**. Isso exige entrar nos portais com o
acesso de cada cliente e extrair documento a documento. Dois fluxos ilustram o
padrão:

**Segurança Social (contribuições):**
Acesso Direto → Segurança Social Direta → "Pagamentos e dívidas" → "Valores a
pagar" → "Fazer pagamentos" → a guia aparece com **entidade, referência e valor**
→ gera-se o **PDF**.

**Autoridade Tributária (ex.: IVA, retenção na fonte):**
Acesso Direto → Portal das Finanças → procurar o imposto pelo nome (ex.:
"declaração periódica do IVA") → "Consultar declaração" → "Obter documento de
pagamento" → **PDF**.

Depois de obtido, o processo termina simples: **anexar o PDF e enviar ao e-mail
do cliente**.

> É aqui — na extração cliente a cliente e no envio — que o gabinete perde a maior
> parte do tempo. Este é o problema que o sistema deve resolver.

---

## 5. Objetivo do sistema

O sistema a construir deve, de forma autónoma e recorrente:

- **Autenticar-se** no TOConline e, via "Acesso Direto", nos portais da AT,
  e-Fatura e Segurança Social, usando o **utilizador dedicado de cada cliente**.
- **Extrair as guias de pagamento** de cada obrigação fiscal de cada cliente, em
  PDF, replicando os caminhos que hoje são percorridos manualmente.
- **Entregar cada guia ao cliente correto** (por e-mail), no momento adequado.
- **Acompanhar o estado** de cada obrigação, por cliente e por período (o que
  ainda falta extrair, o que já foi enviado, o que deu erro, o que não se aplica).
- **Enviar lembretes** ao cliente que não pagou dentro do prazo, respeitando as
  datas de validade e os prazos legais.
- Oferecer um **painel de gestão** onde a equipe do gabinete supervisiona tudo,
  vê os erros destacados para intervenção manual e consegue **reprocessar** um
  caso após corrigi-lo.

A decisão de escopo tomada com o cliente é **automatizar o ciclo completo** —
inclusive a parte que hoje já é feita em lote no TOConline — para que o gabinete
não precise executar nem essa etapa manualmente.

---

## 6. Natureza técnica do sistema

O sistema combina, conceitualmente, quatro capacidades (descrição do que ele _é_,
não de como construí-lo):

- **Automação de browser (RPA):** navegação programática do TOConline e dos
  portais do Estado para chegar a cada guia e baixar o PDF. Cada tipo de documento
  corresponde a um caminho de navegação específico.
- **Orquestração e agendamento:** disparar o ciclo por cliente e por obrigação
  nos momentos certos do mês, sem repetir trabalho já feito.
- **Persistência de estado e auditoria:** um registro fiel de cada obrigação
  (cliente × tipo de documento × período) e do que aconteceu com ela, incluindo
  trilha de auditoria.
- **Entrega e comunicação:** envio das guias e dos lembretes aos clientes, e um
  painel de gestão para a equipe do gabinete.

---

## 7. Regras de negócio e restrições conhecidas

Estas regras vêm diretamente do funcionamento do gabinete e dos portais. São
verdades do domínio que qualquer solução precisa respeitar.

- **2FA na Segurança Social é obrigatório.** O acesso é feito por um **utilizador
  dedicado por cliente**, não pela senha pessoal do cliente. Não é viável depender
  de códigos SMS que chegam ao telemóvel do cliente.
- **As senhas da Segurança Social expiram com frequência.** Isso é descrito como
  um problema operacional recorrente ("uma grande chatice") e será uma causa comum
  de falha nas execuções — não uma exceção rara.
- **Não repetir trabalho já feito (idempotência).** Antes de executar uma
  obrigação, o sistema deve verificar se ela já foi realizada naquele período; se
  já, marca como concluída em vez de gerar um documento duplicado.
- **"Documento inexistente" é um estado válido, não um erro.** Exemplo: quando o
  imposto a entregar é zero (ex.: IVA a recuperar), o portal informa que não há
  documento de pagamento a gerar. É um resultado esperado.
- **A guia da Segurança Social tem prazo de validade.** É a **única** guia com
  entidade + referência **e** data de validade associada (tipicamente ~5 dias
  úteis). As demais guias não têm essa restrição.
- **Definição de "atraso" e lembretes.** Se o cliente não paga após o envio da
  guia, cabe um lembrete — respeitando a validade da guia e os prazos legais. O
  que exatamente conta como atraso ainda precisa ser definido com o cliente.
- **Sigilo profissional e proteção de dados (RGPD).** O acesso concedido ao
  TOConline **não será total**, por questão de sigilo profissional. O contrato
  entre as partes cobre a confidencialidade e a não fuga de dados de ambos os
  lados. Credenciais e dados de clientes exigem tratamento cuidadoso desde o
  início.

---

## 8. Calendário fiscal relevante (janelas de tempo)

O ritmo do sistema é ditado pelo calendário mensal de obrigações:

- **~Dia 10:** submissão em lote da DMR / comunicação de ordenados (AT e SS).
- **~Dia 17–18:** guia da retenção na fonte de IRS; e, na prática, o gabinete
  costuma **enviar as guias por volta do dia 18** para dar tempo ao cliente.
- **Até o dia 20:** prazo de pagamento das obrigações da Autoridade Tributária.
- **Até o dia 25:** prazo de pagamento das contribuições da Segurança Social.

A maioria das obrigações é **mensal**. Exceções: empresas sem trabalhadores têm
menos obrigações. Pode haver documentos com frequência diferente da mensal — isso
ainda será confirmado no mapeamento completo com o cliente.

---

## 9. Comunicação e operação do projeto

Definido com o cliente como o projeto será conduzido (contexto operacional, não
técnico):

- **Reunião semanal obrigatória** de acompanhamento do progresso.
- **Comunicação diária pelo WhatsApp** para dúvidas pontuais.
- Reuniões adicionais são agendadas apenas quando necessárias, para não consumir
  tempo desnecessário.
- O acesso ao TOConline será liberado pelo proprietário (Ivo sénior); o "Zé"
  permanece disponível ao longo do projeto para esclarecer os caminhos dentro das
  plataformas.

---

## 10. Glossário

- **TOConline** — plataforma cloud de contabilidade da OCC (Ordem dos
  Contabilistas Certificados) de Portugal; ponto central de operação do gabinete.
- **Gabinete de contabilidade** — escritório de contabilidade (equivalente
  português).
- **AT / Autoridade Tributária / Portal das Finanças** — autoridade fiscal
  portuguesa e seu portal.
- **Segurança Social / Segurança Social Direta** — órgão e portal das
  contribuições sociais.
- **e-Fatura** — sistema da AT para faturação eletrônica.
- **DMR (Declaração Mensal de Remunerações)** — declaração mensal de salários,
  submetida à AT e à Segurança Social.
- **IVA (Declaração Periódica do IVA)** — imposto sobre o valor acrescentado.
- **Retenção na fonte de IRS** — valor retido dos ordenados dos trabalhadores.
- **Guia de pagamento** — documento (PDF) que o cliente usa para pagar um imposto
  ou contribuição.
- **Entidade e referência** — dados de pagamento (tipo referência Multibanco) que
  constam de uma guia; a guia da Segurança Social também traz uma **validade**.
- **Acesso Direto** — função do TOConline que entra nos portais do Estado sem
  reintroduzir credenciais.
- **Execução multiempresa** — visão do TOConline com todos os clientes, usada para
  operações em lote.
- **Utilizador dedicado** — usuário criado por cliente para contornar o 2FA da
  Segurança Social.

---

## 11. Pontos ainda em aberto (a confirmar com o cliente)

Não são tarefas — são lacunas de conhecimento que ainda serão resolvidas e que
convém ter em mente ao raciocinar sobre o projeto:

- A **lista completa** de tipos de documento/obrigação a automatizar (o cliente
  vai compilar).
- O funcionamento exato do **utilizador dedicado por cliente** na Segurança Social
  e onde ficam essas credenciais.
- Como o gabinete **confirma que um cliente pagou** (se há algum sinal
  disponível), o que afeta o encerramento do ciclo e a lógica de lembretes.
- Existência de obrigações com **frequência diferente da mensal**.
- O **escopo exato do acesso limitado** ao TOConline imposto pelo sigilo
  profissional.
