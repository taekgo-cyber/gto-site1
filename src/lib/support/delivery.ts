export type SupportReplyDeliveryRequest = {
  ticketId: string;
  replyId: string;
  recipientEmail: string | null;
  subject: string;
  message: string;
  statusUrl: string;
};

export type SupportReplyDeliveryResult =
  | { channel: "WEB"; status: "WEB_ONLY" }
  | { channel: "EMAIL"; status: "SENT"; providerMessageId?: string }
  | { channel: "EMAIL"; status: "FAILED"; errorCode: string };

export interface SupportReplyDeliveryProvider {
  deliver(request: SupportReplyDeliveryRequest): Promise<SupportReplyDeliveryResult>;
}

// S22 has no production email provider. The answer is durable in the DB and
// immediately visible through the capability URL; email can be plugged in later.
export const webOnlySupportReplyProvider: SupportReplyDeliveryProvider = {
  async deliver() {
    return { channel: "WEB", status: "WEB_ONLY" };
  },
};
