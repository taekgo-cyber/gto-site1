import { cache } from "react";
import { prisma } from "@/lib/prisma";

export type LeaseRegionOption = {
  id: string;
  name: string;
  children: Array<{ id: string; name: string }>;
};

export type LeaseMasterOption = {
  id: string;
  name: string;
};

export type LeaseMasterData = {
  regions: LeaseRegionOption[];
  vehicleTypes: LeaseMasterOption[];
  tonnages: LeaseMasterOption[];
};

export const getLeaseMasterData = cache(async (): Promise<LeaseMasterData> => {
  const [regions, vehicleTypes, tonnages] = await Promise.all([
    prisma.region.findMany({
      where: { isActive: true },
      select: { id: true, name: true, depth: true, parentId: true },
      orderBy: [{ depth: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.vehicleType.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.tonnage.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const provinces = regions.filter((region) => region.depth === 1);
  const regionOptions: LeaseRegionOption[] = provinces.map((province) => ({
    id: province.id,
    name: province.name,
    children: regions
      .filter((region) => region.parentId === province.id)
      .map((region) => ({ id: region.id, name: region.name })),
  }));

  return {
    regions: regionOptions,
    vehicleTypes: vehicleTypes.map((vehicleType) => ({
      id: vehicleType.id,
      name: vehicleType.name,
    })),
    tonnages: tonnages.map((tonnage) => ({ id: tonnage.id, name: tonnage.name })),
  };
});
