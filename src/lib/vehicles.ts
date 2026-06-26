import sedanImg from "@/assets/vehicle-sedan.jpg";
import businessImg from "@/assets/vehicle-business.jpg";
import suvImg from "@/assets/vehicle-suv.jpg";
import limoImg from "@/assets/vehicle-limo.jpg";
import busImg from "@/assets/vehicle-bus.jpg";
import { StaticImageData } from "next/image";

export const VEHICLE_IMAGES: Record<string, StaticImageData> = {
  sedan: sedanImg,
  business: businessImg,
  suv: suvImg,
  limousine: limoImg,
  party_bus: busImg,
};

export const VEHICLE_LABELS: Record<string, string> = {
  sedan: "Luxury Sedan",
  business: "Business Class",
  suv: "Luxury SUV",
  limousine: "Stretch Limousine",
  party_bus: "Party Bus",
};
