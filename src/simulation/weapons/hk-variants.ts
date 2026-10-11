/** Functional families documented in the HK USP Compact operator's manual.
 * Labels describe mechanisms, not an unverified assignment to a police service.
 */
export const hkVariants = [
  {
    id: 'sa-da-combined-left',
    name: 'DA/SA · seguro + desamartillador · izq.',
    dao: false,
    safety: true,
    decocker: true,
    side: 'left',
  },
  {
    id: 'sa-da-combined-right',
    name: 'DA/SA · seguro + desamartillador · der.',
    dao: false,
    safety: true,
    decocker: true,
    side: 'right',
  },
  {
    id: 'sa-da-decock-left',
    name: 'DA/SA · desamartillador · izq.',
    dao: false,
    safety: false,
    decocker: true,
    side: 'left',
  },
  {
    id: 'sa-da-decock-right',
    name: 'DA/SA · desamartillador · der.',
    dao: false,
    safety: false,
    decocker: true,
    side: 'right',
  },
  {
    id: 'sa-da-safety-left',
    name: 'DA/SA · solo seguro · izq.',
    dao: false,
    safety: true,
    decocker: false,
    side: 'left',
  },
  {
    id: 'sa-da-safety-right',
    name: 'DA/SA · solo seguro · der.',
    dao: false,
    safety: true,
    decocker: false,
    side: 'right',
  },
  {
    id: 'dao-safety-left',
    name: 'DAO · seguro · izq.',
    dao: true,
    safety: true,
    decocker: false,
    side: 'left',
  },
  {
    id: 'dao-safety-right',
    name: 'DAO · seguro · der.',
    dao: true,
    safety: true,
    decocker: false,
    side: 'right',
  },
  { id: 'dao', name: 'DAO · sin palanca', dao: true, safety: false, decocker: false, side: 'none' },
] as const
export type HKVariantId = (typeof hkVariants)[number]['id']
