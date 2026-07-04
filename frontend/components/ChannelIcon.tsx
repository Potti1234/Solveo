"use client";

import { Mail, MessageCircle, Phone, Star, UserRound, Voicemail } from "lucide-react";

export function ChannelIcon({ channel }: { channel: string }) {
  const normalized = channel.toLowerCase();
  if (normalized === "email") return <Mail size={17} />;
  if (normalized === "sms" || normalized === "whatsapp") return <MessageCircle size={17} />;
  if (normalized === "review") return <Star size={17} />;
  if (normalized === "voicemail") return <Voicemail size={17} />;
  if (normalized === "front_desk") return <UserRound size={17} />;
  return <Phone size={17} />;
}
