pushd api
rm -rf node_modules dist
npm install --no-package-lock
npm run build

if [ $? -eq 0 ]; then
  echo "Previous command succeeded"
else
  echo "npm install is failed. Please check!!!"
  exit 1
fi
popd

pushd ..

tar --exclude="*.tar*" --exclude-vcs -czf ${APP_NAME}.tar assets
cp ${APP_NAME}.tar assets/${APP_NAME}.tar.gz

popd

