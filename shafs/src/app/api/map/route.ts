import { NextResponse } from "next/server";
import { getConfig } from "@/config/env";

export function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const origin = searchParams.get("origin")?.trim();
  const destination = searchParams.get("destination")?.trim();

  if (!origin || !destination) {
    return NextResponse.json({ error: "origin and destination are required" }, { status: 400 });
  }

  const apiKey = getConfig().routing.googleMapsApiKey;
  if (!apiKey) {
    return NextResponse.json({ error: "Maps API key not configured" }, { status: 503 });
  }

  const embedUrl =
    `https://www.google.com/maps/embed/v1/directions` +
    `?key=${apiKey}` +
    `&origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    `&mode=driving`;

  return NextResponse.redirect(embedUrl);
}
