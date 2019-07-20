const fs = require(`fs`)
const { createFilePath } = require(`gatsby-source-filesystem`)
const path = require(`path`)

// Quick-and-dirty helper to convert strings into URL-friendly slugs.
const slugify = str => {
  const slug = str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-\$)+/g, "")
  return slug
}

const contentPath = "content"
// Make sure the data directory exists
exports.onPreBootstrap = ({ reporter }) => {
  if (!fs.existsSync(contentPath)) {
    reporter.info(`creating the ${contentPath} directory`)
    fs.mkdirSync(contentPath)
  }
}

// Define the "BlogPost" type
// is there a way to just grab everything on an mdx node? no body/excerpt/timetoread/...
// should I do this in createSchemaCustomization or sourceNodes? What's the difference?
exports.sourceNodes = ({ actions, schema }) => {
  // either SDL or graphql-js!

  //how to add cover: File or ImageSharp in here with @dontinfer?
  actions.createTypes(`
    type BlogPost implements Node {
      id: ID!
      slug: String!
      title: String!
      date: Date! @dateformat
      author: String!
      tags: [String]!
      keywords: [String]!
      excerpt(pruneLength: Int = 140): String!
      body: String!
      cover: File
      timeToRead: Int
      tableOfContents(maxDepth: Int = 6): JSON
    }
  `)
}

// helper that grabs the mdx resolver when given a string fieldname
const mdxResolverPassthrough = fieldName => async (
  source,
  args,
  context,
  info
) => {
  const type = info.schema.getType(`Mdx`)
  const mdxNode = context.nodeModel.getNodeById({
    id: source.parent,
  })
  const resolver = type.getFields()[fieldName].resolve
  const result = await resolver(mdxNode, args, context, {
    fieldName,
  })
  return result
}

// Define resolvers for custom fields
exports.createResolvers = ({ createResolvers }) => {
  createResolvers({
    BlogPost: {
      excerpt: {
        resolve: mdxResolverPassthrough(`excerpt`),
      },
      body: {
        resolve: mdxResolverPassthrough(`body`),
      },
      timeToRead: {
        resolve: mdxResolverPassthrough(`timeToRead`),
      },
      tableOfContents: {
        resolve: mdxResolverPassthrough(`tableOfContents`),
      },
    },
  })
}

// https://www.gatsbyjs.org/tutorial/building-a-theme/
// pr to createtypes docs

exports.onCreateNode = ({
  node,
  actions,
  getNode,
  createNodeId,
  createContentDigest,
}) => {
  const { createNode, createParentChildLink } = actions

  // Make sure it's an MDX node
  if (node.internal.type !== `Mdx`) {
    return
  }

  // Create source field (according to contentPath)
  const fileNode = getNode(node.parent)
  const source = fileNode.sourceInstanceName

  if (node.internal.type === `Mdx` && source === contentPath) {
    const slug = createFilePath({ node, getNode })

    const fieldData = {
      title: node.frontmatter.title,
      tags: node.frontmatter.tags || [],
      slug,
      date: node.frontmatter.date,
      author: node.frontmatter.author,
      keywords: node.frontmatter.keywords,
      cover: node.frontmatter.cover,
    }

    // fill the BlogPost type nodes we created during createTypes with data
    createNode({
      ...fieldData,
      // Required fields.
      id: createNodeId(`${node.id} >>> BlogPost`),
      parent: node.id,
      children: [],
      internal: {
        type: `BlogPost`,
        contentDigest: createContentDigest(fieldData),
        content: JSON.stringify(fieldData),
        description: `Blog Posts`,
      },
    })
    createParentChildLink({ parent: fileNode, child: node })
  }
}

exports.createPages = async ({ actions, graphql, reporter }) => {
  const result = await graphql(`
    query MyQuery {
      allBlogPost(sort: { fields: date, order: DESC }) {
        edges {
          node {
            slug
            id
            tags
          }
        }
      }
    }
  `)

  if (result.errors) {
    reporter.panic("error loading mdx pages", result.error)
    return
  }

  const { allBlogPost } = result.data
  const posts = allBlogPost.edges

  // create a page for each blogPost
  posts.forEach(({ node: post }, i) => {
    const next = i === 0 ? null : posts[i - 1].node
    const prev = i === posts.length - 1 ? null : posts[i + 1].node
    const { slug } = post
    actions.createPage({
      path: `/blog${slug}`,
      component: path.resolve("./src/templates/blog-post.js"),
      context: {
        slug,
        prev: prev,
        next: next,
      },
    })
  })

  // create paginated blog-list pages
  const postsPerPage = 6
  const numPages = Math.ceil(posts.length / postsPerPage)
  Array.from({
    length: numPages,
  }).forEach((_, index) => {
    actions.createPage({
      path: index === 0 ? `/blog` : `/blog/${index + 1}`,
      component: path.resolve("./src/templates/blog-posts.js"),
      context: {
        limit: postsPerPage,
        skip: index * postsPerPage,
        numPages,
        currentPage: index + 1,
      },
    })
  })

  // make array with all tags
  const allTagList = posts.reduce((acc, post) => {
    const postTags = post.node.tags
    return acc.concat(postTags)
  }, [])

  // filter duplicates
  const tagList = [...new Set(allTagList)]

  // create tag-list page
  actions.createPage({
    path: `/blog/tag`,
    component: path.resolve("./src/templates/tags.js"),
    context: {
      tagList,
    },
  })

  // create a page for each tag
  tagList.forEach(tag => {
    actions.createPage({
      path: `/blog/tag/${slugify(tag)}`,
      component: path.resolve("./src/templates/tag.js"),
      context: {
        tag,
      },
    })
  })
}

// try to get an imagesharp node from the cover field in the frontmatter with @dontinfer
// const imageSharpResolverPassthrough = () => async (
//   source,
//   args,
//   context,
//   info
// ) => {
//   const type = info.schema.getType(`ImageSharp`)
//   const mdxNode = context.nodeModel.getNodeById({
//     id: source.parent,
//   })

//   // console.log(typeof type.getFields().keys(key => key.resolve))
//   const resolver = type.getFields().fixed.resolve
//   const result = await resolver(mdxNode, args, context, { "fixed": "fixed"})
//   return result
// }
