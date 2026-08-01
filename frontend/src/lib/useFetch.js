import { useState, useEffect, useCallback, useRef } from 'react';
import api from './api';

export default function useFetch(path, deps = [], { params } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const key = JSON.stringify(deps);
  const paramsKey = JSON.stringify(params || {});
  const [reloadToken, setReloadToken] = useState(0);
  const mounted = useRef(true);

  const reload = useCallback(() => setReloadToken(t => t + 1), []);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    api.get(path, { params })
      .then(res => {
        if (mounted.current) {
          setData(res.data.data);
          setError(null);
        }
      })
      .catch(err => { if (mounted.current) setError(err.response?.data?.message || err.message); })
      .finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key, paramsKey, reloadToken]);

  return { data, loading, error, reload };
}
