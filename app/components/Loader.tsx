import React from 'react'

const Loader = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      height="24px"
      width="24px"
      fill="#999"
      className="animate-spin"
    >
      <path d="M8.13,21.21Q6.3,20.43 4.94,19.06Q3.58,17.7 2.79,15.88T2,11.99T2.79,8.11T4.94,4.94T8.13,2.79T12,2q0.43,0 0.71,0.29T13,3q0,0.42-0.29,0.71T12,4Q8.68,4 6.34,6.34T4,12t2.34,5.66T12,20t5.66-2.34T20,12q0-0.43 0.29-0.71T21,11q0.43,0 0.71,0.29T22,12q0,2.05-0.79,3.88t-2.15,3.19t-3.17,2.15T12.01,22T8.13,21.21Z" />
    </svg>
  );
}

export default Loader