import sedanImg from "@/assets/vehicle-sedan.jpg";
import businessImg from "@/assets/vehicle-business.jpg";
import suvImg from "@/assets/vehicle-suv.jpg";
import limoImg from "@/assets/vehicle-limo.jpg";
import busImg from "@/assets/vehicle-bus.jpg";
import sedanCut from "@/assets/cutouts/vehicle-sedan.png";
import businessCut from "@/assets/cutouts/vehicle-business.png";
import suvCut from "@/assets/cutouts/vehicle-suv.png";
import limoCut from "@/assets/cutouts/vehicle-limo.png";
import busCut from "@/assets/cutouts/vehicle-bus.png";
import { StaticImageData } from "next/image";

export const VEHICLE_IMAGES: Record<string, StaticImageData> = {
  sedan: sedanImg,
  business: businessImg,
  suv: suvImg,
  limousine: limoImg,
  party_bus: busImg,
};

/** Transparent studio cutouts — for showcase cards where the vehicle floats. */
export const VEHICLE_CUTOUTS: Record<string, StaticImageData> = {
  sedan: sedanCut,
  business: businessCut,
  suv: suvCut,
  limousine: limoCut,
  party_bus: busCut,
};

export const VEHICLE_LABELS: Record<string, string> = {
  sedan: "Luxury Sedan",
  business: "Business Class",
  suv: "Luxury SUV",
  limousine: "Stretch Limousine",
  party_bus: "Party Bus",
};
