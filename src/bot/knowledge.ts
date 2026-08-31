import { normalizeText } from "./rules.js";

const entries: Array<{ terms: string[]; answer: string }> = [
  {
    terms: ["troca", "trocar", "mudar tamanho"],
    answer: "As trocas podem ser pedidas até 14 dias corridos após a receção e são gratuitas. Envie um email para suporte@lisabonastreetwear.pt com o número da encomenda e a palavra “troca”. A guia é normalmente emitida em 48 horas."
  },
  {
    terms: ["devolução", "devolucao", "devolver"],
    answer: "Pode pedir a devolução até 14 dias corridos após a entrega, através de suporte@lisabonastreetwear.pt. O envio de retorno fica a cargo do cliente. Após receção e verificação, o reembolso é processado em até 10 dias úteis pelo método de pagamento original."
  },
  {
    terms: ["reembolso", "dinheiro de volta"],
    answer: "Depois de recebermos e verificarmos o artigo, o reembolso é processado em até 10 dias úteis, através do mesmo método de pagamento utilizado na compra."
  },
  {
    terms: ["defeito", "danificado", "artigo errado", "produto errado"],
    answer: "Lamento que tenha acontecido. Envie fotografias do artigo e da embalagem para suporte@lisabonastreetwear.pt. Emitimos uma guia de transporte gratuita e os portes são reembolsados. A nossa equipa acompanhará o caso."
  },
  {
    terms: ["original", "originais", "autêntico", "autentico", "falso"],
    answer: "Todos os artigos vendidos nos nossos websites são originais e passam por um processo de verificação de autenticidade antes de seguirem para o cliente."
  },
  {
    terms: ["loja física", "loja fisica", "entrega em mãos", "entrega em maos"],
    answer: "De momento, operamos apenas online e não fazemos entregas em mãos. As encomendas seguem por correio expresso, com código de rastreamento."
  },
  {
    terms: ["portes", "custa o envio", "preço do envio", "preco do envio"],
    answer: "O custo de envio é calculado no checkout de acordo com o destino. Pode consultá-lo antes de finalizar a encomenda."
  },
  {
    terms: ["fatura", "nif"],
    answer: "Pode inserir o seu NIF no checkout, no campo “Empresa (opcional)”."
  },
  {
    terms: ["tamanho", "qual tamanho"],
    answer: "Consulte a tabela de tamanhos disponível no website. Para evitar uma indicação incorreta, não recomendamos tamanhos sem essa referência."
  },
  {
    terms: ["cancelar", "cancelamento"],
    answer: "O cancelamento pode ser possível nas primeiras 24 horas, se a encomenda ainda não estiver paga ou se já tiver ultrapassado 15 dias úteis. Para confirmar o seu caso, indique “estado da encomenda” e valide os dados da compra."
  }
];

export function matchCanonicalKnowledge(message: string): string | null {
  const normalized = normalizeText(message);
  return entries.find((entry) => entry.terms.some((term) => normalized.includes(term)))?.answer ?? null;
}
