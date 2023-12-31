import { app, errorHandler } from 'mu';
import {
  verifyKeyAndOrganisation,
  isSubmitted,
  sendErrorAlert,
  cleanseRequestBody,
} from './support';
import bodyParser from 'body-parser';
import * as jsonld from 'jsonld';
import {
  enrichBodyForRegister,
  extractInfoFromTriplesForRegister,
  extractAuthentication,
  validateExtractedInfo,
} from './jsonld-input';
import * as config from './config';
import { Lock } from 'async-await-mutex-lock';
import * as N3 from 'n3';
import { scheduleJob } from './tasks/register-task';
import { dispatchOnDelta } from './tasks/controller';

app.use(errorHandler);
// support both jsonld and json content-type
app.use(bodyParser.json({ type: 'application/ld+json' }));
app.use(bodyParser.json());

app.post('/melding', async function (req, res) {
  try {
    ensureValidContentType(req.get('content-type'));
    ensureValidDataType(req.body);
    // enrich the body with minimum required json LD properties
    const enrichedBody = await enrichBodyForRegister(req.body);
    // extracted the minimal required triples
    const store = await jsonLdToStore(enrichedBody);

    const extracted = extractInfoFromTriplesForRegister(store);

    // check if the minimal required payload is available
    ensureMinimalRegisterPayload(extracted);

    // check if the extracted properties are valid
    //TODO: what can we validate?
    ensureValidRegisterProperties(extracted);

    // authenticate vendor
    const { organisationID, organisation, vendor } = await ensureAuthorisation(store);

    const submissionGraph = config.GRAPH_TEMPLATE.replace(
      '~ORGANIZATION_ID~',
      organisationID,
    );

    // check if the resource has already been submitted
    await ensureNotSubmitted(extracted.submittedResource, submissionGraph);

    // process the new auto-submission
    const { submissionUri, jobUri } = await scheduleJob(
      store,
      { ...extracted, submissionGraph, organisation, vendor }
    );

    res
      .status(201)
      .send({ submission: submissionUri, job: jobUri })
      .end();
  }
  catch (e) {
    const errorDetails = e.message || e;

    console.error(errorDetails);

    const detail = JSON.stringify(
      {
        err: errorDetails,
        req: cleanseRequestBody(req.body),
      },
      undefined,
      2,
    );

    sendErrorAlert({
      message:
        'Something unexpected went wrong while processing an BerichtenCentrum API request.',
      detail,
      reference: e.reference,
    });

    res
      .status(e.errorCode || 500)
      .send(
        e.errorBody ||
          `An error happened while processing the BerichtenCentrum API request.
           If this keeps occurring for no good reason,
            please contact us at digitaalABB@vlaanderen.be.
          Please consult the technical error below.\n${errorDetails}`,
      )
      .end();
  }
});

const lock = new Lock();

app.post('/delta', async function (req, res) {
  // We use locking mechanism as a queue-ing system.
  // TODO: is this true? What happens with incoming requests during processing, bounced? or scheduled?
  await lock.acquire();
  try {
    await dispatchOnDelta(req);
    res.status(200).send().end();
  } catch (e) {
    console.error(e.message);
    if (!e.alreadyStoredError)
      sendErrorAlert({
        message: `Could not process a delta status update, retreived message: \n ${e.message}`,
        detail: JSON.stringify({ error: e.message }),
        job: e.job || ''
      });
    res.status(500).json({
      errors: [
        {
          title:
            'An error occured while updating a delta information',
          error: JSON.stringify(e),
        },
      ],
    });
  } finally {
    lock.release();
  }
});

///////////////////////////////////////////////////////////////////////////////
// Helpers
///////////////////////////////////////////////////////////////////////////////

function ensureValidContentType(contentType) {
  if (!/application\/(ld\+)?json/.test(contentType)) {
    const err = new Error(
      'Content-Type not valid, only application/json or application/ld+json are accepted',
    );
    err.errorCode = 400;
    err.errorBody = { errors: [{ title: err.message }] };
    throw err;
  }
}

function ensureValidDataType(body) {
  if (body instanceof Array) {
    const err = new Error(
      'Invalid JSON payload, expected an object but found array.',
    );
    err.errorCode = 400;
    err.errorBody = { errors: [{ title: err.message }] };
    throw err;
  }
}

function ensureMinimalRegisterPayload(object) {
  for (const prop in object)
    if (!object[prop]) {
      const err = new Error(
        `Invalid JSON-LD payload: property "${prop}" is missing or invalid.`,
      );
      err.errorCode = 400;
      err.errorBody = {
        errors: [{ title: err.message }],
      };
      throw err;
    }
}

function ensureValidRegisterProperties(object) {
  const { isValid, errors } = validateExtractedInfo(object);
  if (!isValid) {
    const err = new Error(
      `Some given properties are invalid:\n${errors
        .map((e) => e.message)
        .join('\n')}
        `,
    );
    err.errorCode = 400;
    err.errorBody = { errors };
    throw err;
  }
}

async function ensureNotSubmitted(submittedResource, submissionGraph) {
  if (await isSubmitted(submittedResource, submissionGraph)) {
    const err = new Error(
      `The given submittedResource <${submittedResource}> has already been submitted.`,
    );
    err.errorCode = 409;
    err.errorBody = { errors: [{ title: err.message }] };
    throw err;
  }
}

async function ensureAuthorisation(store) {
  const authentication = extractAuthentication(store);
  if (
    !(
      authentication.vendor &&
      authentication.key &&
      authentication.organisation
    )
  ) {
    const err = new Error(
      'The authentication (or part of it) for this request is missing. Make sure to supply publisher (with vendor URI and key) and organization information to the request.',
    );
    err.errorCode = 400;
    err.errorBody = { errors: [{ title: err.message }] };
    throw err;
  }
  const organisationID = await verifyKeyAndOrganisation(
    authentication.vendor,
    authentication.key,
    authentication.organisation,
  );
  if (!organisationID) {
    const error = new Error(
      'Authentication failed, vendor does not have access to the organization or does not exist. If this should not be the case, please contact us at digitaalABB@vlaanderen.be for login credentials.',
    );
    error.errorCode = 401;
    error.errorBody = { errors: [{ title: error.message }] };
    error.reference = authentication.vendor;
    throw error;
  }
  return { organisationID, organisation: authentication.organisation, vendor: authentication.vendor };
}

async function jsonLdToStore(jsonLdObject) {
  const requestQuads = await jsonld.default.toRDF(jsonLdObject, {});
  const store = new N3.Store();
  store.addQuads(requestQuads);
  return store;
}
