import React from 'react'
import Hero from './components/Hero'

const page = () => {
  return (
    <div><Hero />
    <section data-nav-theme="white" className='w-full min-h-screen h-full bg-white'></section>
    <section data-nav-theme="black" className='w-full min-h-screen h-full bg-black'></section>
    </div>
  )
}

export default page