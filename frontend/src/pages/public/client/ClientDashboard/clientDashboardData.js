export const dashboardStats = [
  {
    id: 'total',
    label: 'Factures totales',
    value: 128,
    detail: '+12 ce mois',
    tone: 'primary',
    symbol: '∑',
  },
  {
    id: 'accepted',
    label: 'Acceptées',
    value: 104,
    detail: '81,3 % du total',
    tone: 'success',
    symbol: '✓',
  },
  {
    id: 'pending',
    label: 'En attente',
    value: 14,
    detail: 'Traitement en cours',
    tone: 'warning',
    symbol: '…',
  },
  {
    id: 'rejected',
    label: 'Rejetées',
    value: 10,
    detail: 'Action requise',
    tone: 'danger',
    symbol: '!',
  },
];

export const invoiceStatusData = [
  {
    id: 'accepted',
    label: 'Acceptées',
    value: 104,
    percentage: 81,
    tone: 'success',
  },
  {
    id: 'pending',
    label: 'En attente',
    value: 14,
    percentage: 11,
    tone: 'warning',
  },
  {
    id: 'rejected',
    label: 'Rejetées',
    value: 7,
    percentage: 5,
    tone: 'danger',
  },
  {
    id: 'error',
    label: 'Erreurs techniques',
    value: 3,
    percentage: 3,
    tone: 'purple',
  },
];

export const processingInvoice = {
  invoiceNumber: '10001403',
  source: 'PDF',
  currentStep: 4,
  updatedAt: 'Il y a 2 minutes',
  steps: [
    { id: 1, label: 'Import', description: 'Fichier reçu' },
    { id: 2, label: 'Extraction', description: 'Données extraites' },
    { id: 3, label: 'Validation', description: 'Contrôles réussis' },
    { id: 4, label: 'TEIF', description: 'XML en génération' },
    { id: 5, label: 'Signature', description: 'En attente' },
    { id: 6, label: 'TTN', description: 'Non démarré' },
  ],
};

export const recentInvoices = [
  {
    id: 1,
    number: '10001403',
    customer: 'CFAB Somme',
    date: '06 août 2026',
    amount: '108,00 EUR',
    source: 'PDF',
    status: 'pending',
    statusLabel: 'En traitement',
  },
  {
    id: 2,
    number: '10001293',
    customer: 'NEBOUT SA',
    date: '05 août 2026',
    amount: '6 460,69 EUR',
    source: 'ERP',
    status: 'accepted',
    statusLabel: 'Acceptée',
  },
  {
    id: 3,
    number: 'FA260002',
    customer: 'IT SOFT',
    date: '04 août 2026',
    amount: '2 097,730 TND',
    source: 'OCR',
    status: 'accepted',
    statusLabel: 'Acceptée',
  },
  {
    id: 4,
    number: '10001409',
    customer: 'Client France',
    date: '03 août 2026',
    amount: '405,89 EUR',
    source: 'PDF',
    status: 'rejected',
    statusLabel: 'Rejetée',
    reason: 'Identifiant fournisseur manquant',
  },
];

export const quickActions = [
  {
    id: 'upload',
    title: 'Importer une facture',
    description: 'PDF, image ou document scanné',
    path: '/client/invoices/upload',
    symbol: '+',
    tone: 'primary',
  },
  {
    id: 'invoices',
    title: 'Voir mes factures',
    description: 'Consulter tous les statuts',
    path: '/client/invoices',
    symbol: '≡',
    tone: 'neutral',
  },
  {
    id: 'rejected',
    title: 'Corriger les rejets',
    description: 'Afficher les factures à corriger',
    path: '/client/invoices?status=rejected',
    symbol: '!',
    tone: 'danger',
  },
  {
    id: 'support',
    title: 'Contacter le support',
    description: 'Obtenir une assistance',
    path: '/contact',
    symbol: '?',
    tone: 'neutral',
  },
];
