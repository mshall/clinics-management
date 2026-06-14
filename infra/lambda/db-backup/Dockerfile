FROM public.ecr.aws/lambda/nodejs:22

RUN dnf install -y postgresql15 gzip && dnf clean all

WORKDIR ${LAMBDA_TASK_ROOT}
COPY package.json ./
RUN npm install --omit=dev
COPY index.mjs ./

CMD ["index.handler"]
