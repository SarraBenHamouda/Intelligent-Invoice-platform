const {
  buildClientDashboard,
  deleteInvoiceDuplicates,
} = require('../services/invoiceService');

const {
  getMonthlyFinancialDigest,
} = require('./monthlyDigest.controller');

/*
|--------------------------------------------------------------------------
| IDENTITÉ UTILISATEUR
|--------------------------------------------------------------------------
*/

function getAuthenticatedUser(req) {
  const clientId =
    req.user?.id ||
    req.user?.user_id ||
    req.user?.sub;

  const organizationId =
    req.user?.organizationId ||
    req.user?.organization_id ||
    null;

  return {
    clientId,
    organizationId,
  };
}

/*
|--------------------------------------------------------------------------
| GET CLIENT DASHBOARD
|--------------------------------------------------------------------------
*/

async function getClientDashboard(
  req,
  res,
) {
  try {
    const {
      clientId,
      organizationId,
    } =
      getAuthenticatedUser(req);

    if (!clientId) {
      return res
        .status(401)
        .json({
          success: false,
          message:
            'Utilisateur non authentifié',
        });
    }

    const dashboard =
      await buildClientDashboard({
        clientId,
        organizationId,
      });

    res.set({
      'Cache-Control':
        'no-store, no-cache, must-revalidate, proxy-revalidate',

      Pragma:
        'no-cache',

      Expires:
        '0',
    });

    return res
      .status(200)
      .json(dashboard);
  } catch (error) {
    console.error(
      'Erreur dashboard client:',
      error,
    );

    return res
      .status(500)
      .json({
        success: false,

        message:
          'Impossible de charger le tableau de bord',

        error:
          process.env.NODE_ENV ===
          'development'
            ? error.message
            : undefined,
      });
  }
}

/*
|--------------------------------------------------------------------------
| DELETE DUPLICATES
|--------------------------------------------------------------------------
*/

async function deleteDuplicates(
  req,
  res,
) {
  try {
    const {
      clientId,
      organizationId,
    } =
      getAuthenticatedUser(req);

    if (!clientId) {
      return res
        .status(401)
        .json({
          success: false,
          message:
            'Utilisateur non authentifié',
        });
    }

    const invoiceId =
      req.params.id;

    if (!invoiceId) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            'Identifiant facture manquant.',
        });
    }

    const result =
      await deleteInvoiceDuplicates({
        clientId,
        organizationId,
        invoiceId,
      });

    return res
      .status(200)
      .json({
        success: true,

        message:
          result.deletedCount > 0
            ? `${result.deletedCount} doublon(s) supprimé(s).`
            : 'Aucun doublon à supprimer.',

        invoiceId:
          result.invoiceId,

        invoiceNumber:
          result.invoiceNumber,

        deletedCount:
          result.deletedCount,

        deletedInvoices:
          result.deletedInvoices,
      });
  } catch (error) {
    console.error(
      'Erreur suppression doublons:',
      error,
    );

    return res
      .status(
        error.statusCode ||
          500,
      )
      .json({
        success: false,

        message:
          error.message ||
          'Impossible de supprimer les doublons.',
      });
  }
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  getClientDashboard,
  deleteDuplicates,
  getMonthlyFinancialDigest,
};