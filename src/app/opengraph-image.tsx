import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site-config";

export const alt = `${SITE.fullName} — Chauffeur Service in the Greater Toronto Area`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0d0d0e",
          color: "#ffffff",
          fontFamily: "Georgia, serif",
        }}
      >
        <div
          style={{
            fontSize: 28,
            letterSpacing: "0.35em",
            textTransform: "uppercase",
            color: "#c9a76a",
            marginBottom: 28,
          }}
        >
          Toronto · Est. 2018
        </div>
        <div style={{ display: "flex", fontSize: 96, fontWeight: 400 }}>
          <span>SophRia</span>
        </div>
        <div style={{ display: "flex", fontSize: 96, color: "#e7d3a8" }}>
          Limousine Services
        </div>
        <div
          style={{
            marginTop: 36,
            width: 80,
            height: 2,
            backgroundColor: "#c9a76a",
          }}
        />
        <div
          style={{
            marginTop: 32,
            fontSize: 30,
            color: "rgba(255,255,255,0.75)",
            fontFamily: "Arial, sans-serif",
          }}
        >
          Discreet. Punctual. Effortless.
        </div>
      </div>
    ),
    { ...size }
  );
}
