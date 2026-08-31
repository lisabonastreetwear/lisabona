import { detectLanguage, normalizeText, type Language } from "./rules.js";

type Answers = Record<Language, string>;
const entries: Array<{ terms: string[]; answers: Answers }> = [
  {
    terms: ["troca", "trocar", "mudar tamanho", "exchange", "change size", "cambio", "cambiar talla"],
    answers: {
      pt: "As trocas podem ser pedidas até 14 dias corridos após a receção e são gratuitas. Envie um email para suporte@lisabonastreetwear.pt com o número da encomenda e a palavra “troca”. A guia é normalmente emitida em 48 horas.",
      en: "Exchanges can be requested within 14 calendar days of delivery and are free. Email suporte@lisabonastreetwear.pt with the order number and the word “exchange”. The shipping label is normally issued within 48 hours.",
      es: "Los cambios pueden solicitarse durante los 14 días naturales posteriores a la entrega y son gratuitos. Envíe un email a suporte@lisabonastreetwear.pt con el número del pedido y la palabra “cambio”. La etiqueta suele emitirse en 48 horas."
    }
  },
  {
    terms: ["devolução", "devolucao", "devolver", "return", "devolución"],
    answers: {
      pt: "Pode pedir a devolução até 14 dias corridos após a entrega, através de suporte@lisabonastreetwear.pt. O envio de retorno fica a cargo do cliente. Após receção e verificação, o reembolso é processado em até 10 dias úteis pelo método de pagamento original.",
      en: "You can request a return within 14 calendar days of delivery by emailing suporte@lisabonastreetwear.pt. Return shipping is paid by the customer. After receipt and inspection, the refund is processed within 10 business days to the original payment method.",
      es: "Puede solicitar una devolución durante los 14 días naturales posteriores a la entrega escribiendo a suporte@lisabonastreetwear.pt. El envío de devolución corre a cargo del cliente. Tras la recepción y verificación, el reembolso se procesa en un plazo de 10 días laborables."
    }
  },
  {
    terms: ["reembolso", "dinheiro de volta", "refund"],
    answers: {
      pt: "Depois de recebermos e verificarmos o artigo, o reembolso é processado em até 10 dias úteis, através do mesmo método de pagamento utilizado na compra.",
      en: "After we receive and inspect the item, the refund is processed within 10 business days to the original payment method.",
      es: "Después de recibir y verificar el artículo, el reembolso se procesa en un plazo de 10 días laborables mediante el método de pago original."
    }
  },
  {
    terms: ["defeito", "danificado", "artigo errado", "produto errado", "defective", "damaged", "wrong item", "defectuoso", "dañado", "artículo equivocado"],
    answers: {
      pt: "Lamento que tenha acontecido. Envie fotografias do artigo e da embalagem para suporte@lisabonastreetwear.pt. Emitimos uma guia de transporte gratuita e os portes são reembolsados. A nossa equipa acompanhará o caso.",
      en: "I am sorry this happened. Please send photos of the item and packaging to suporte@lisabonastreetwear.pt. We will issue a free return label and refund the shipping costs. Our team will follow the case.",
      es: "Lamento lo ocurrido. Envíe fotos del artículo y del embalaje a suporte@lisabonastreetwear.pt. Emitiremos una etiqueta de devolución gratuita y reembolsaremos los gastos de envío. Nuestro equipo seguirá el caso."
    }
  },
  {
    terms: ["original", "originais", "autêntico", "autentico", "falso"],
    answers: {
      pt: "Todos os artigos vendidos nos nossos websites são originais e passam por um processo de verificação de autenticidade antes de seguirem para o cliente.",
      en: "All items sold through our websites are authentic and undergo an authentication process before being shipped to the customer.",
      es: "Todos los artículos vendidos en nuestros sitios web son originales y pasan por un proceso de autenticación antes de enviarse al cliente."
    }
  },
  {
    terms: ["loja física", "loja fisica", "entrega em mãos", "entrega em maos"],
    answers: { pt: "De momento, operamos apenas online e não fazemos entregas em mãos. As encomendas seguem por correio expresso, com código de rastreamento.", en: "We currently operate online only and do not offer in-person collection. Orders are sent by express courier with tracking.", es: "Actualmente operamos exclusivamente online y no ofrecemos entrega en mano. Los pedidos se envían por mensajería urgente con seguimiento." }
  },
  {
    terms: ["portes", "custa o envio", "preço do envio", "preco do envio"],
    answers: { pt: "O custo de envio é calculado no checkout de acordo com o destino. Pode consultá-lo antes de finalizar a encomenda.", en: "Shipping cost is calculated at checkout according to the destination. You can review it before completing the order.", es: "El coste de envío se calcula en el checkout según el destino. Puede consultarlo antes de finalizar el pedido." }
  },
  {
    terms: ["fatura", "nif"],
    answers: { pt: "Pode inserir o seu NIF no checkout, no campo “Empresa (opcional)”.", en: "You can enter your tax number at checkout in the “Company (optional)” field.", es: "Puede introducir su número fiscal en el checkout, en el campo “Empresa (opcional)”." }
  },
  {
    terms: ["tamanho", "qual tamanho"],
    answers: { pt: "Consulte a tabela de tamanhos disponível no website. Para evitar uma indicação incorreta, não recomendamos tamanhos sem essa referência.", en: "Please check the size guide on the website. To avoid incorrect advice, we do not recommend a size without that reference.", es: "Consulte la guía de tallas del sitio web. Para evitar una recomendación incorrecta, no aconsejamos una talla sin esa referencia." }
  },
  {
    terms: ["cancelar", "cancelamento"],
    answers: { pt: "O cancelamento pode ser possível nas primeiras 24 horas, se a encomenda ainda não estiver paga ou se já tiver ultrapassado 15 dias úteis. Para confirmar o seu caso, indique “estado da encomenda” e valide os dados da compra.", en: "Cancellation may be possible within the first 24 hours, if the order is still unpaid, or after 15 business days. To verify your case, ask for the order status and validate the purchase details.", es: "La cancelación puede ser posible durante las primeras 24 horas, si el pedido aún no está pagado o después de 15 días laborables. Para comprobar su caso, solicite el estado del pedido y valide los datos de compra." }
  }
];

export function matchCanonicalKnowledge(message: string): string | null {
  const normalized = normalizeText(message);
  const entry = entries.find((item) => item.terms.some((term) => normalized.includes(term)));
  return entry?.answers[detectLanguage(message)] ?? null;
}
