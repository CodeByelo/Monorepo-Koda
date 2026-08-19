"use client";
import React, { useState, useMemo } from "react";
import { Search, Users, Shield, Building2, Mail, User } from "lucide-react";
import { ApiUser } from "../../../lib/api";
import { OrgCategory } from "../types";

interface DirectorioPersonasProps {
  users: ApiUser[];
  orgStructure: OrgCategory[];
  darkMode: boolean;
}

const getMatchedDeptName = (userDept: string, allOrgDepts: string[]): string => {
  const uDept = (userDept || "").trim();
  if (!uDept) return "Sin Asignar";
  if (allOrgDepts.length === 0) return uDept;

  const clean = (s: string) => s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/^gerencia nacional de /, "")
    .replace(/^gerencia de /, "")
    .replace(/^coordinacion de /, "")
    .replace(/^coordinacion /, "")
    .trim();

  const cleanUserDept = clean(uDept);

  // 1. Coincidencia exacta (case-insensitive)
  const exactMatch = allOrgDepts.find(
    (d) => d.toLowerCase().trim() === uDept.toLowerCase().trim()
  );
  if (exactMatch) return exactMatch;

  // 2. Coincidencia limpia exacta
  const cleanMatch = allOrgDepts.find((d) => clean(d) === cleanUserDept);
  if (cleanMatch) return cleanMatch;

  // 3. Coincidencia de subcadena limpia
  const subMatch = allOrgDepts.find((d) => {
    const cleanD = clean(d);
    return cleanD.includes(cleanUserDept) || cleanUserDept.includes(cleanD);
  });
  if (subMatch) return subMatch;

  // 4. Si no hay coincidencia con la estructura oficial, retornar 'Sin Asignar' para evitar mostrar nombres no oficiales
  return "Sin Asignar";
};

export function DirectorioPersonas({ users, orgStructure, darkMode }: DirectorioPersonasProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [deptFilter, setDeptFilter] = useState("ALL");

  // Aplanar gerencias de la estructura organizativa
  const allOrgDepts = useMemo(() => {
    return (orgStructure || []).flatMap((group) => group.items || []);
  }, [orgStructure]);

  // Lista de departamentos para el selector (select) de filtros
  const selectDepts = useMemo(() => {
    if (allOrgDepts.length > 0) return allOrgDepts;

    // Fallback por si la estructura no está cargada aún
    const depts = new Set<string>();
    users.forEach((u) => {
      const dept = u.gerencia_depto || u.gerencia_nombre;
      if (dept) depts.add(dept);
    });
    return Array.from(depts);
  }, [allOrgDepts, users]);

  // Obtener lista única de roles
  const uniqueRoles = useMemo(() => {
    const roles = new Set<string>();
    users.forEach((u) => {
      if (u.role) roles.add(u.role);
    });
    return Array.from(roles);
  }, [users]);

  // Filtrar los usuarios
  const filteredUsers = useMemo(() => {
    return users.map((u) => {
      // Mapear el departamento del usuario para que coincida con la estructura oficial
      const officialDept = getMatchedDeptName(
        u.gerencia_depto || u.gerencia_nombre || "",
        allOrgDepts
      );
      return {
        ...u,
        displayDept: officialDept,
      };
    }).filter((u) => {
      const nombreCompleto = `${u.nombre || ""} ${u.apellido || ""}`.toLowerCase().trim();
      const username = (u.username || "").toLowerCase();
      const email = (u.email || "").toLowerCase();
      const role = (u.role || "").toLowerCase();
      const dept = u.displayDept.toLowerCase();

      const matchesSearch =
        nombreCompleto.includes(searchTerm.toLowerCase()) ||
        username.includes(searchTerm.toLowerCase()) ||
        email.includes(searchTerm.toLowerCase()) ||
        role.includes(searchTerm.toLowerCase()) ||
        dept.includes(searchTerm.toLowerCase());

      const matchesRole = roleFilter === "ALL" || u.role === roleFilter;
      const matchesDept = deptFilter === "ALL" || u.displayDept === deptFilter;

      return matchesSearch && matchesRole && matchesDept;
    });
  }, [users, allOrgDepts, searchTerm, roleFilter, deptFilter]);

  return (
    <div className="space-y-6">
      {/* FILTROS Y BÚSQUEDA */}
      <div
        className={`p-6 rounded-2xl border ${
          darkMode
            ? "bg-gradient-to-br from-[#122224] to-[#0a1415] border-[#1d3538]/70 shadow-lg shadow-black/20"
            : "bg-white border-slate-200 shadow-sm"
        } flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center`}
      >
        {/* Input de búsqueda */}
        <div className="relative flex-1">
          <Search
            size={18}
            className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${
              darkMode ? "text-slate-400" : "text-slate-500"
            }`}
          />
          <input
            type="text"
            placeholder="Buscar por nombre, correo, rol, gerencia..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 ${
              darkMode
                ? "bg-[#091112] border-[#1d3538]/50 text-slate-100 placeholder-slate-500 focus:ring-[#00C294]/40 focus:border-[#00C294]"
                : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-emerald-500/20 focus:border-emerald-500"
            }`}
          />
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Filtro Rol */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className={`px-3 py-2.5 rounded-xl border text-sm transition-all focus:outline-none ${
              darkMode
                ? "bg-[#091112] border-[#1d3538]/50 text-slate-300 focus:border-[#00C294]"
                : "bg-slate-50 border-slate-200 text-slate-700 focus:border-emerald-500"
            }`}
          >
            <option value="ALL">Todos los Roles</option>
            {uniqueRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>

          {/* Filtro Gerencia */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className={`px-3 py-2.5 rounded-xl border text-sm transition-all focus:outline-none max-w-xs ${
              darkMode
                ? "bg-[#091112] border-[#1d3538]/50 text-slate-300 focus:border-[#00C294]"
                : "bg-slate-50 border-slate-200 text-slate-700 focus:border-emerald-500"
            }`}
          >
            <option value="ALL">Todas las Gerencias</option>
            {selectDepts.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* TABLA DE USUARIOS */}
      <div
        className={`rounded-2xl border overflow-hidden ${
          darkMode
            ? "bg-gradient-to-br from-[#122224] to-[#0a1415] border-[#1d3538]/70 shadow-lg"
            : "bg-white border-slate-200 shadow-sm"
        }`}
      >
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr
                className={`border-b text-xs font-semibold uppercase tracking-wider ${
                  darkMode
                    ? "bg-[#0b1718] border-[#1d3538]/50 text-[#00C294]"
                    : "bg-slate-50 border-slate-100 text-slate-600"
                }`}
              >
                <th className="py-4 px-6">Personal</th>
                <th className="py-4 px-6">Correo</th>
                <th className="py-4 px-6">Rol</th>
                <th className="py-4 px-6">Gerencia / Departamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-solid">
              {filteredUsers.length > 0 ? (
                filteredUsers.map((u, i) => {
                  const hasName = u.nombre || u.apellido;
                  const fullName = hasName ? `${u.nombre || ""} ${u.apellido || ""}` : u.username;
                  
                  return (
                    <tr
                      key={u.id || i}
                      className={`text-sm transition-colors ${
                        darkMode
                          ? "border-[#1d3538]/20 hover:bg-[#122224]/50 text-slate-300"
                          : "border-slate-100 hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      {/* Personal */}
                      <td className="py-4 px-6 flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                            darkMode
                              ? "bg-[#00C294]/10 text-[#00C294]"
                              : "bg-emerald-50 text-emerald-600"
                          }`}
                        >
                          <User size={16} />
                        </div>
                        <div>
                          <p className={`font-semibold ${darkMode ? "text-white" : "text-slate-900"}`}>
                            {fullName}
                          </p>
                          {hasName && (
                            <p className={`text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                              @{u.username}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Correo */}
                      <td className="py-4 px-6 font-mono text-xs">
                        {u.email ? (
                          <span className="flex items-center gap-2">
                            <Mail size={14} className={darkMode ? "text-slate-500" : "text-slate-400"} />
                            {u.email}
                          </span>
                        ) : (
                          <span className={darkMode ? "text-slate-600" : "text-slate-400"}>
                            No registrado
                          </span>
                        )}
                      </td>

                      {/* Rol */}
                      <td className="py-4 px-6">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wider ${
                            u.role === "CEO"
                              ? darkMode
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                              : u.role === "Administrador" || u.role === "Desarrollador"
                              ? darkMode
                                ? "bg-[#00C294]/10 text-[#00C294] border border-[#00C294]/20"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : u.role === "Gerente"
                              ? darkMode
                                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                                : "bg-cyan-50 text-cyan-700 border border-cyan-200"
                              : darkMode
                              ? "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                              : "bg-slate-50 text-slate-700 border border-slate-200"
                          }`}
                        >
                          <Shield size={12} />
                          {u.role || "Usuario"}
                        </span>
                      </td>

                      {/* Gerencia */}
                      <td className="py-4 px-6">
                        <span className="flex items-center gap-2">
                          <Building2 size={14} className={darkMode ? "text-slate-500" : "text-slate-400"} />
                          {u.displayDept}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="py-8 text-center">
                    <p className={`text-sm ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                      No se encontraron colaboradores en la búsqueda.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
