"use client";

import { createContext, useContext } from "react";

/** False for funcionários without the "deposito" section: the Estoque UI shows only the Loja. */
const DepositoAccess = createContext(true);

export const DepositoAccessProvider = DepositoAccess.Provider;
export const useCanDeposito = () => useContext(DepositoAccess);
