"use client";

import NextImage from "next/image";
import { useRef, useState } from "react";
import { applicationBrand } from "../../../content/organization";

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image unavailable"));
    image.src = src;
  });
}

function wrapLines(context: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? line + " " + word : word;
      if (line && context.measureText(candidate).width > width) {
        lines.push(line);
        line = "";
      }
      for (const character of Array.from((line ? " " : "") + word)) {
        if (context.measureText(line + character).width > width) {
          lines.push(line);
          line = "";
        }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

type CardProps = {
  testOnly?: boolean;
  name: string;
  memberId: string;
  memberSince: string;
  photoUrl: string;
  address: string;
  mobile: string | null;
  designation: string;
  membershipStatus: string;
  validity: { label: string; value: string };
};

export function MemberIdCard(props: CardProps) {
  const {
    name,
    memberId,
    memberSince,
    photoUrl,
    address,
    mobile,
    designation,
    membershipStatus,
    validity,
  } = props;
  const pending = useRef(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const details = [
    ["Name", name],
    ["Address", address],
    ["Phone", mobile || "Not provided"],
    ["Membership status", membershipStatus.toLowerCase()],
    [validity.label, validity.value],
    ["Member since", memberSince],
  ];

  async function download() {
    if (pending.current) return;
    pending.current = true;
    setDownloading(true);
    setError("");
    try {
      const [photo, logo] = await Promise.all([
        loadImage(photoUrl),
        loadImage(applicationBrand.logo),
      ]);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Download unavailable");
      context.font = "600 52px system-ui, sans-serif";
      const nameLines = wrapLines(context, name, 750);
      context.font = "32px system-ui, sans-serif";
      const fieldLines = details.map(([label, value]) => ({
        label,
        lines: wrapLines(context, value, 740),
      }));
      const faceHeight = Math.max(
        1480,
        1240 + nameLines.length * 64,
        420 + fieldLines.reduce((height, field) => height + 72 + field.lines.length * 44, 0),
      );
      canvas.width = 1920;
      canvas.height = faceHeight + 80;
      context.fillStyle = "#eceee8";
      context.fillRect(0, 0, canvas.width, canvas.height);

      const face = (x: number) => {
        context.save();
        context.translate(x, 40);
        context.fillStyle = "#fbf5e9";
        context.beginPath();
        context.roundRect(0, 0, 900, faceHeight, 32);
        context.fill();
        context.clip();
      };
      face(40);
      context.fillStyle = "#163f33";
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(900, 0);
      context.lineTo(900, 300);
      context.quadraticCurveTo(450, 400, 0, 300);
      context.closePath();
      context.fill();
      context.drawImage(logo, 385, 28, 130, 130);
      context.fillStyle = "#fff8eb";
      context.textAlign = "center";
      context.font = "700 48px system-ui, sans-serif";
      context.fillText(applicationBrand.name, 450, 220);
      context.font = "22px system-ui, sans-serif";
      context.fillText("Community development program of Tuluworld Foundation", 450, 263, 800);
      context.save();
      context.beginPath();
      context.roundRect(270, 400, 360, 360, 30);
      context.clip();
      context.drawImage(photo, 270, 400, 360, 360);
      context.restore();
      context.fillStyle = "#163f33";
      context.font = "600 52px system-ui, sans-serif";
      nameLines.forEach((line, index) => context.fillText(line, 450, 850 + index * 64));
      context.font = "32px system-ui, sans-serif";
      context.fillText(designation.toUpperCase(), 450, 850 + nameLines.length * 64 + 36);
      context.font = "23px system-ui, sans-serif";
      context.fillText("MEMBER ID", 450, faceHeight - 200);
      context.font = "25px ui-monospace, monospace";
      context.fillText(memberId, 450, faceHeight - 154, 790);
      context.fillStyle = "#b07b2e";
      context.fillRect(70, faceHeight - 100, 760, 3);
      context.font = "26px system-ui, sans-serif";
      context.fillStyle = "#163f33";
      context.fillText("Tuluworld Foundation", 450, faceHeight - 43);
      context.restore();

      face(980);
      context.fillStyle = "#163f33";
      context.font = "700 37px system-ui, sans-serif";
      context.fillText("MEMBERSHIP DETAILS", 80, 110);
      context.fillStyle = "#b07b2e";
      context.fillRect(80, 153, 740, 3);
      let y = 220;
      for (const field of fieldLines) {
        context.fillStyle = "#58665a";
        context.font = "600 23px system-ui, sans-serif";
        context.fillText(field.label.toUpperCase(), 80, y);
        y += 48;
        context.fillStyle = "#163f33";
        context.font = "32px system-ui, sans-serif";
        for (const line of field.lines) {
          context.fillText(line, 80, y);
          y += 44;
        }
        y += 24;
      }
      context.fillStyle = "#163f33";
      context.fillRect(0, faceHeight - 140, 900, 140);
      context.fillStyle = "#fff8eb";
      context.font = "23px system-ui, sans-serif";
      context.fillText("Foundation support", 80, faceHeight - 85);
      context.font = "30px system-ui, sans-serif";
      context.fillText("tuluworld@gmail.com", 80, faceHeight - 37);
      context.restore();

      if (props.testOnly) {
        context.fillStyle = "#7c2600";
        context.font = "700 30px system-ui, sans-serif";
        context.textAlign = "center";
        context.fillText(
          "TEST ONLY — NO REAL MEMBERSHIP ENTITLEMENT",
          canvas.width / 2,
          canvas.height - 12,
        );
      }
      const image = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!image) throw new Error("Download unavailable");
      const url = URL.createObjectURL(image);
      const link = document.createElement("a");
      link.href = url;
      link.download = "Tuluva-Mahasabhe-member-id.png";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError("Could not download your card. Reload the page and try again.");
    } finally {
      pending.current = false;
      setDownloading(false);
    }
  }

  return (
    <>
      {props.testOnly && (
        <p role="note">TEST ID card — fictional Member, no real membership entitlement.</p>
      )}
      <section className="member-id-set" aria-label="Member ID card front and back">
        <section className="member-id-face member-id-front" aria-label="ID card front">
          <header className="member-id-heading">
            <NextImage src={applicationBrand.logo} width={76} height={76} alt="" />
            <strong>{applicationBrand.name}</strong>
            <small>{applicationBrand.description}</small>
          </header>
          <NextImage
            className="member-id-portrait"
            src={photoUrl}
            width={144}
            height={144}
            alt={`${name}'s profile photo`}
            unoptimized
          />
          <h2>{name}</h2>
          <p className="member-id-designation">{designation}</p>
          <div className="member-id-number">
            <span>Member ID</span>
            <strong>{memberId}</strong>
          </div>
          <footer>Tuluworld Foundation</footer>
        </section>
        <section className="member-id-face member-id-back" aria-label="ID card back">
          <h2>Membership details</h2>
          <dl>
            {details.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <footer>
            <span>Foundation support</span>
            <strong>tuluworld@gmail.com</strong>
          </footer>
        </section>
      </section>
      <button type="button" disabled={downloading} onClick={() => void download()}>
        {downloading ? "Preparing card…" : "Download ID card"}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
