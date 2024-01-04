// /src/pages/Workspace.tsx
import React, { useEffect, useState } from 'react';

const Workspace = () => {
  const [files, setFiles] = useState([]);
  const [workspacePath, setWorkspacePath] = useState('');

  useEffect(() => {
    const fetchDataPathAndListFiles = async () => {
      const dataPath = await window.electron.invoke('get-data-path');
      console.log('Data Path:', dataPath);

      // Format the path with quotes for terminal use
      const formattedPath = `"${dataPath}"`;
      setWorkspacePath(formattedPath);

      // Call the function to list files
      const filesList = await window.electron.listFiles(dataPath);
      setFiles(filesList);
    };

    fetchDataPathAndListFiles();
  }, []);

  return (
    <div className="px-5 py-20 w-full flex flex-col justify-center items-center h-[calc(100vh_-_50px)]">
      <div className="w-[1200px] flex flex-col justify-start items-start space-y-4 border h-full py-4 rounded-md overflow-y-scroll">
        <div className="w-full px-4 flex flex-row justify-between items-center">
          <h1 className="text-[1.4em] font-light">Workspace</h1>
          <p>
            Path:{' '}
            <code className="bg-gray-100 p-1 rounded-md text-sm">
              {workspacePath}
            </code>
          </p>
        </div>
        <ul className="w-full">
          {files.map((file) => (
            <li key={file} className="border-b py-2 w-full bg-gray-100 px-4">
              {file}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Workspace;
